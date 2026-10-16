from decimal import Decimal
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from catalog.models import Category, Product
from core.permissions import ROLE_ADMIN, ROLE_MANAGER, ROLE_STAFF
from inventory.models import StockLevel, StockMovement
from purchasing.models import PurchaseOrder, PurchaseOrderLine, Supplier
from warehouses.models import Warehouse

User = get_user_model()


class PurchasingTestCase(TestCase):
    def setUp(self):
        self.client = APIClient()

        # Groups
        self.admin_group, _ = Group.objects.get_or_create(name=ROLE_ADMIN)
        self.manager_group, _ = Group.objects.get_or_create(name=ROLE_MANAGER)
        self.staff_group, _ = Group.objects.get_or_create(name=ROLE_STAFF)

        # Warehouses
        self.warehouse1 = Warehouse.objects.create(
            name="Main Warehouse",
            code="MWH",
            address_line1="123 Industrial Area",
            city="Bengaluru",
            state="Karnataka",
            pincode="560001",
        )
        self.warehouse2 = Warehouse.objects.create(
            name="North Hub",
            code="NHB",
            address_line1="456 Logistics Park",
            city="Delhi",
            state="Delhi",
            pincode="110001",
        )

        # Users
        self.admin = User.objects.create_user(
            username="admin_user", email="admin@invlab.com", password="password123", is_superuser=True
        )
        self.admin.groups.add(self.admin_group)

        self.manager1 = User.objects.create_user(
            username="manager_one", email="mgr1@invlab.com", password="password123"
        )
        self.manager1.groups.add(self.manager_group)
        self.manager1.profile.warehouse = self.warehouse1
        self.manager1.profile.save()

        self.staff1 = User.objects.create_user(
            username="staff_one", email="staff1@invlab.com", password="password123"
        )
        self.staff1.groups.add(self.staff_group)
        self.staff1.profile.warehouse = self.warehouse1
        self.staff1.profile.save()

        # Category and Products
        self.category = Category.objects.create(name="Hardware")
        self.product1 = Product.objects.create(
            sku="HW-001",
            name="Cordless Drill",
            category=self.category,
            price=Decimal("3000.00"),
            cost_price=Decimal("1500.00"),
            stock=10,  # 10 existing units at ₹1500
        )
        self.product2 = Product.objects.create(
            sku="HW-002",
            name="Toolbox 50-Piece",
            category=self.category,
            price=Decimal("1200.00"),
            cost_price=Decimal("600.00"),
            stock=20,
        )

        # Initial stock level in warehouse 1
        StockLevel.objects.create(
            product=self.product1,
            warehouse=self.warehouse1,
            quantity=10,
            reorder_level=5,
        )

        # Supplier
        self.supplier = Supplier.objects.create(
            name="Bosch Tools Ltd",
            contact_person="Ramesh Patel",
            phone="9876543210",
            email="sales@bosch-tools.in",
            gstin="29ABCDE1234F1Z5",
        )

    def test_create_purchase_order_draft(self):
        """Creating purchase order starts in draft state with correct total amount."""
        self.client.force_authenticate(user=self.admin)
        payload = {
            "supplier_id": self.supplier.id,
            "warehouse_id": self.warehouse1.id,
            "notes": "Urgent seasonal restock",
            "lines": [
                {
                    "product_id": self.product1.id,
                    "quantity_ordered": 20,
                    "unit_cost": "1600.00",
                },
                {
                    "product_id": self.product2.id,
                    "quantity_ordered": 10,
                    "unit_cost": "650.00",
                },
            ],
        }

        res = self.client.post("/api/v1/purchase-orders/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        data = res.json()
        self.assertEqual(data["status"], "draft")
        # 20 * 1600 = 32000, 10 * 650 = 6500 -> total 38500
        self.assertEqual(Decimal(data["total_amount"]), Decimal("38500.00"))
        self.assertEqual(len(data["lines"]), 2)

    def test_status_workflow_and_editing_restriction(self):
        """Only draft orders can be modified; once ordered, edits are blocked."""
        self.client.force_authenticate(user=self.admin)
        # Create draft PO
        po = PurchaseOrder.objects.create(
            po_number="PO-TEST-001",
            supplier=self.supplier,
            warehouse=self.warehouse1,
            status=PurchaseOrder.STATUS_DRAFT,
            total_amount=Decimal("16000.00"),
            created_by=self.admin,
        )
        line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=self.product1,
            quantity_ordered=10,
            unit_cost=Decimal("1600.00"),
            subtotal=Decimal("16000.00"),
        )

        # Transition to ordered
        res = self.client.post(f"/api/v1/purchase-orders/{po.id}/mark_ordered/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        po.refresh_from_db()
        self.assertEqual(po.status, "ordered")

        # Attempt to edit once ordered -> Should be blocked with 400
        edit_payload = {
            "supplier_id": self.supplier.id,
            "warehouse_id": self.warehouse1.id,
            "lines": [
                {
                    "product_id": self.product1.id,
                    "quantity_ordered": 15,
                    "unit_cost": "1600.00",
                }
            ],
        }
        edit_res = self.client.put(f"/api/v1/purchase-orders/{po.id}/", edit_payload, format="json")
        self.assertEqual(edit_res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_partial_receiving_and_weighted_average_cost(self):
        """Receiving items increases warehouse stock, creates ledger movement, and updates weighted cost."""
        self.client.force_authenticate(user=self.admin)

        # Initial state: product1 has 10 units @ cost 1500.00
        self.assertEqual(self.product1.stock, 10)
        self.assertEqual(self.product1.cost_price, Decimal("1500.00"))

        po = PurchaseOrder.objects.create(
            po_number="PO-TEST-002",
            supplier=self.supplier,
            warehouse=self.warehouse1,
            status=PurchaseOrder.STATUS_ORDERED,
            total_amount=Decimal("36000.00"),
            created_by=self.admin,
        )
        line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=self.product1,
            quantity_ordered=20,
            unit_cost=Decimal("1800.00"),
            subtotal=Decimal("36000.00"),
        )

        # Receive 10 out of 20 units
        receipt_payload = {
            "receipts": [
                {
                    "line_id": line.id,
                    "quantity_received": 10,
                }
            ]
        }
        res = self.client.post(f"/api/v1/purchase-orders/{po.id}/receive_items/", receipt_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        # PO status should now be partially_received
        po.refresh_from_db()
        line.refresh_from_db()
        self.assertEqual(po.status, "partially_received")
        self.assertEqual(line.quantity_received, 10)
        self.assertEqual(line.quantity_remaining, 10)

        # StockLevel should have increased by 10 (10 initial + 10 = 20)
        sl = StockLevel.objects.get(product=self.product1, warehouse=self.warehouse1)
        self.assertEqual(sl.quantity, 20)

        # StockMovement ledger entry must exist with type 'purchase'
        movement = StockMovement.objects.filter(product=self.product1, reference=po.po_number).latest("id")
        self.assertEqual(movement.movement_type, "purchase")
        self.assertEqual(movement.delta, 10)
        self.assertEqual(movement.balance_after, 20)

        # Weighted average cost:
        # Old: 10 units @ 1500 = 15000
        # New receipt: 10 units @ 1800 = 18000
        # Total: (15000 + 18000) / 20 = 33000 / 20 = 1650.00
        self.product1.refresh_from_db()
        self.assertEqual(self.product1.cost_price, Decimal("1650.00"))
        self.assertEqual(self.product1.stock, 20)

    def test_full_receiving_marks_po_received(self):
        """Receiving all remaining units transitions PO status to 'received'."""
        self.client.force_authenticate(user=self.admin)
        po = PurchaseOrder.objects.create(
            po_number="PO-TEST-003",
            supplier=self.supplier,
            warehouse=self.warehouse1,
            status=PurchaseOrder.STATUS_ORDERED,
            total_amount=Decimal("8000.00"),
            created_by=self.admin,
        )
        line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=self.product1,
            quantity_ordered=5,
            quantity_received=0,
            unit_cost=Decimal("1600.00"),
            subtotal=Decimal("8000.00"),
        )

        # Receive all 5 units
        receipt_payload = {
            "receipts": [
                {
                    "line_id": line.id,
                    "quantity_received": 5,
                }
            ]
        }
        res = self.client.post(f"/api/v1/purchase-orders/{po.id}/receive_items/", receipt_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_200_OK)

        po.refresh_from_db()
        self.assertEqual(po.status, "received")

    def test_over_receiving_blocked(self):
        """Attempting to receive more units than ordered is rejected with 400."""
        self.client.force_authenticate(user=self.admin)
        po = PurchaseOrder.objects.create(
            po_number="PO-TEST-004",
            supplier=self.supplier,
            warehouse=self.warehouse1,
            status=PurchaseOrder.STATUS_ORDERED,
            total_amount=Decimal("8000.00"),
            created_by=self.admin,
        )
        line = PurchaseOrderLine.objects.create(
            purchase_order=po,
            product=self.product1,
            quantity_ordered=5,
            quantity_received=2,
            unit_cost=Decimal("1600.00"),
            subtotal=Decimal("8000.00"),
        )

        # Remaining is 3. Attempting to receive 4 must fail
        receipt_payload = {
            "receipts": [
                {
                    "line_id": line.id,
                    "quantity_received": 4,
                }
            ]
        }
        res = self.client.post(f"/api/v1/purchase-orders/{po.id}/receive_items/", receipt_payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cancellation_rules(self):
        """PO can be cancelled if draft/ordered, but blocked if any quantity was received."""
        self.client.force_authenticate(user=self.admin)
        po1 = PurchaseOrder.objects.create(
            po_number="PO-TEST-005",
            supplier=self.supplier,
            warehouse=self.warehouse1,
            status=PurchaseOrder.STATUS_ORDERED,
            total_amount=Decimal("8000.00"),
            created_by=self.admin,
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po1,
            product=self.product1,
            quantity_ordered=5,
            quantity_received=0,
            unit_cost=Decimal("1600.00"),
            subtotal=Decimal("8000.00"),
        )

        # Cancelling when 0 received succeeds
        res1 = self.client.post(f"/api/v1/purchase-orders/{po1.id}/cancel_order/")
        self.assertEqual(res1.status_code, status.HTTP_200_OK)
        po1.refresh_from_db()
        self.assertEqual(po1.status, "cancelled")

        # PO with 1 unit received cannot be cancelled
        po2 = PurchaseOrder.objects.create(
            po_number="PO-TEST-006",
            supplier=self.supplier,
            warehouse=self.warehouse1,
            status=PurchaseOrder.STATUS_PARTIALLY_RECEIVED,
            total_amount=Decimal("8000.00"),
            created_by=self.admin,
        )
        PurchaseOrderLine.objects.create(
            purchase_order=po2,
            product=self.product1,
            quantity_ordered=5,
            quantity_received=1,
            unit_cost=Decimal("1600.00"),
            subtotal=Decimal("8000.00"),
        )
        res2 = self.client.post(f"/api/v1/purchase-orders/{po2.id}/cancel_order/")
        self.assertEqual(res2.status_code, status.HTTP_400_BAD_REQUEST)

    def test_supplier_deletion_protection(self):
        """Supplier with associated purchase orders cannot be deleted."""
        self.client.force_authenticate(user=self.admin)
        PurchaseOrder.objects.create(
            po_number="PO-TEST-007",
            supplier=self.supplier,
            warehouse=self.warehouse1,
            status=PurchaseOrder.STATUS_DRAFT,
            total_amount=Decimal("0.00"),
            created_by=self.admin,
        )

        res = self.client.delete(f"/api/v1/suppliers/{self.supplier.id}/")
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Supplier.objects.filter(id=self.supplier.id).exists())

    def test_manager_scoping(self):
        """Warehouse manager can only access and create POs for their assigned warehouse."""
        self.client.force_authenticate(user=self.manager1)

        # Attempt to create PO for warehouse 2 (not assigned) -> 403 Forbidden
        payload = {
            "supplier_id": self.supplier.id,
            "warehouse_id": self.warehouse2.id,
            "lines": [
                {
                    "product_id": self.product1.id,
                    "quantity_ordered": 5,
                    "unit_cost": "1500.00",
                }
            ],
        }
        res = self.client.post("/api/v1/purchase-orders/", payload, format="json")
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
