export type Role = 'Admin' | 'Warehouse Manager' | 'Staff';

export interface UserProfile {
  phone: string;
  warehouse: WarehouseMinimal | null;
}

export interface User {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  must_change_password: boolean;
  role: Role;
  warehouse?: WarehouseMinimal | null;
  permissions?: string[];
  profile: UserProfile | null;
  last_login?: string;
}

export interface WarehouseMinimal {
  id: number;
  name: string;
  code: string;
  city: string;
  state: string;
  is_active: boolean;
}

export interface Warehouse extends WarehouseMinimal {
  address_line1: string;
  address_line2: string;
  pincode: string;
  phone: string;
  email: string;
  manager: {
    id: number;
    username: string;
    first_name: string;
    last_name: string;
    full_name?: string;
    email: string;
    phone?: string;
  } | null;
  staff_count: number;
  created_at: string;
  updated_at: string;
}

export interface WarehouseStaffMember {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  phone: string;
  role: Role;
  is_active: boolean;
}

export interface WarehouseOverview extends Warehouse {
  staff: WarehouseStaffMember[];
  products_stocked: number;
  total_units: number;
  low_stock_count: number;
  sales_today: string;
  sales_today_count?: number;
  sales_30d: string;
  sales_30d_count?: number;
  pending_transfers: number;
  last_activity?: string | null;
}

export interface WarehouseFullDetail {
  warehouse: Warehouse;
  summary: {
    total_units: number;
    products_stocked: number;
    low_stock_count: number;
    sales_today_amount: string;
    sales_today_count: number;
    sales_30d_amount: string;
    sales_30d_count: number;
  };
  staff: WarehouseStaffMember[];
  stock: {
    id: number;
    product_id: number;
    product_name: string;
    sku: string;
    barcode: string;
    category: string;
    quantity: number;
    reorder_level: number;
    unit: string;
    price: string;
    is_low_stock: boolean;
  }[];
  sales: {
    id: number;
    sale_number: string;
    total_amount: string;
    user: string;
    user_name: string;
    created_at: string;
    items_count: number;
    notes: string;
  }[];
  ledger: {
    id: number;
    product_id: number;
    product_name: string;
    product_sku: string;
    delta: number;
    movement_type: string;
    reason: string;
    reference: string;
    balance_after: number | null;
    user: string;
    created_at: string;
  }[];
}

export interface Category {
  id: number;
  name: string;
  is_active: boolean;
  product_count: number;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: number;
  category_name: string;
  description: string;
  price: string;
  cost_price?: string;
  gst_rate?: string;
  hsn_code?: string;
  barcode?: string | null;
  image?: string | null;
  thumbnail?: string | null;
  default_reorder_level: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export interface StockLevel {
  id: number;
  warehouse: number;
  warehouse_name: string;
  warehouse_code: string;
  product: Product;
  quantity: number;
  reorder_level: number;
  status: StockStatus;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: number;
  stock_level: number;
  warehouse: number;
  warehouse_name: string;
  warehouse_code: string;
  product: number;
  product_name: string;
  product_sku: string;
  delta: number;
  movement_type:
    | 'initial'
    | 'receive'
    | 'purchase'
    | 'sale'
    | 'adjustment'
    | 'transfer_out'
    | 'transfer_in'
    | 'return';
  user: number;
  username: string;
  reason?: string;
  reference: string;
  balance_after?: number | null;
  created_at: string;
}

export interface SaleReturnLine {
  id: number;
  sale_line: number;
  product?: Product;
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price: string;
  refund_amount: string;
}

export interface SaleReturn {
  id: number;
  return_number: string;
  sale: number;
  sale_number: string;
  warehouse: number;
  warehouse_name: string;
  warehouse_code: string;
  processed_by: number;
  processed_by_username: string;
  total_refund_amount: string;
  refund_method: string;
  reason: string;
  lines: SaleReturnLine[];
  created_at: string;
  updated_at: string;
}

export interface SaleLine {
  id: number;
  product: Product;
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price: string;
  unit_cost?: string | null;
  subtotal: string;
  gst_rate?: string;
  hsn_code?: string;
  taxable_amount?: string;
  cgst_amount?: string;
  sgst_amount?: string;
  igst_amount?: string;
  tax_amount?: string;
  returned_quantity?: number;
  returnable_quantity?: number;
}

export interface DashboardKPIs {
  total_revenue: string;
  gross_profit: string;
  profit_margin_pct: number;
  unknown_cost_count: number;
  sales_count: number;
  total_units: number;
  low_stock_count: number;
  total_receivables: string;
  pending_transfers: number;
}

export interface DashboardDailyChartPoint {
  date: string;
  revenue: number;
  profit: number;
  sales_count: number;
}

export interface DashboardData {
  range: string;
  warehouse_id?: number | null;
  kpis: DashboardKPIs;
  daily_chart: DashboardDailyChartPoint[];
}

export type ReturnStatus = 'not_returned' | 'partially_returned' | 'fully_returned';

export type DiscountType = 'none' | 'amount' | 'percent';
export type PaymentMethod = 'cash' | 'upi' | 'card' | 'credit' | 'unknown';

export interface Sale {
  id: number;
  sale_number: string;
  invoice_number?: string;
  warehouse: number;
  warehouse_name: string;
  warehouse_code: string;
  user: number;
  cashier_name: string;
  customer?: number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_gstin?: string;
  place_of_supply?: string;
  is_interstate?: boolean;
  subtotal: string;
  discount_type: DiscountType;
  discount_value: string;
  discount_amount: string;
  taxable_amount?: string;
  cgst_amount?: string;
  sgst_amount?: string;
  igst_amount?: string;
  total_tax_amount?: string;
  round_off_amount?: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  payment_method: PaymentMethod;
  total_refunded?: string;
  net_total?: string;
  return_status?: ReturnStatus;
  notes: string;
  lines: SaleLine[];
  returns?: SaleReturn[];
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface ApiError {
  code: string;
  message: string;
  fields?: Record<string, string[]>;
  details?: Record<string, unknown>;
}

export type TransferStatus = 'draft' | 'in_transit' | 'dispatched' | 'received' | 'cancelled';

export interface StockTransferLine {
  id: number;
  product?: Product;
  product_sku: string;
  product_name: string;
  dispatched_quantity: number;
  received_quantity: number;
  variance: number;
}

export interface StockTransfer {
  id: number;
  transfer_number: string;
  from_warehouse: number;
  from_warehouse_name: string;
  from_warehouse_code: string;
  to_warehouse: number;
  to_warehouse_name: string;
  to_warehouse_code: string;
  status: TransferStatus;
  notes: string;
  dispatched_by: number | null;
  dispatched_by_username: string | null;
  dispatched_at: string | null;
  received_by: number | null;
  received_by_username: string | null;
  received_at: string | null;
  lines: StockTransferLine[];
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  email?: string;
  gstin?: string;
  address?: string;
  is_active: boolean;
  total_balance_due: string;
  lifetime_value: string;
  sales_count: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerSummary {
  lifetime_value: string;
  total_balance_due: string;
  total_payments: string;
  sales_count: number;
}

export interface Payment {
  id: number;
  payment_number: string;
  customer: number;
  customer_name: string;
  customer_phone: string;
  sale: number | null;
  sale_number?: string | null;
  warehouse: number;
  warehouse_name: string;
  warehouse_code: string;
  cashier_name: string;
  amount: string;
  payment_method: string;
  notes: string;
  created_at: string;
}

export interface ReportColumn {
  key: string;
  label: string;
  align: 'left' | 'center' | 'right';
  is_currency: boolean;
}

export interface ReportMeta {
  id: string;
  name: string;
  description: string;
  supports_date_filter: boolean;
  supports_category_filter: boolean;
  supports_warehouse_filter: boolean;
  supported_formats: string[];
}

export interface ReportData {
  report_id: string;
  name: string;
  description: string;
  filters_applied: Record<string, any>;
  summary: Record<string, any>;
  payment_methods_breakdown?: Record<string, { count: number; amount: number }>;
  columns: ReportColumn[];
  rows: Record<string, any>[];
}

export type PurchaseOrderStatus =
  | 'draft'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface Supplier {
  id: number;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  is_active: boolean;
  po_count: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderLine {
  id: number;
  product: number;
  product_name: string;
  product_sku: string;
  quantity_ordered: number;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: string;
  subtotal: string;
}

export interface PurchaseOrder {
  id: number;
  po_number: string;
  supplier: number;
  supplier_name: string;
  warehouse: number;
  warehouse_name: string;
  warehouse_code: string;
  status: PurchaseOrderStatus;
  order_date: string;
  expected_delivery_date: string | null;
  total_amount: string;
  created_by: number;
  created_by_username: string;
  notes: string;
  lines: PurchaseOrderLine[];
  total_ordered_units: number;
  total_received_units: number;
  created_at: string;
  updated_at: string;
}

export interface BusinessSettings {
  id: number;
  name: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  gstin: string;
  invoice_prefix: string;
  prices_include_tax: boolean;
  created_at: string;
  updated_at: string;
}

export interface InvoiceParty {
  name: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  gstin?: string;
  warehouse_name?: string;
  warehouse_code?: string;
  customer_id?: number | null;
  address?: string;
  place_of_supply?: string;
}

export interface InvoiceItem {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  hsn_code: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
  gst_rate: string;
  taxable_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  tax_amount: string;
  total_amount: string;
}

export interface InvoiceHsnSummary {
  hsn_code: string;
  gst_rate: string;
  taxable_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  tax_amount: string;
}

export interface InvoiceFinancials {
  subtotal: string;
  discount_type: DiscountType;
  discount_value: string;
  discount_amount: string;
  taxable_amount: string;
  cgst_amount: string;
  sgst_amount: string;
  igst_amount: string;
  total_tax_amount: string;
  round_off_amount: string;
  total_amount: string;
  amount_paid: string;
  balance_due: string;
  payment_method: PaymentMethod;
  amount_in_words: string;
}

export interface InvoiceDetails {
  sale_id: number;
  sale_number: string;
  invoice_number: string;
  created_at: string;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  is_interstate: boolean;
  prices_include_tax: boolean;
  items: InvoiceItem[];
  hsn_summary: InvoiceHsnSummary[];
  financials: InvoiceFinancials;
}

export interface NotificationSettings {
  id: number;
  enable_low_stock_alerts: boolean;
  enable_daily_summary: boolean;
  additional_recipients: string;
  additional_recipients_list: string[];
  created_at: string;
  updated_at: string;
}

export interface LowStockAlertItem {
  product_id: number;
  product_name: string;
  sku: string;
  barcode: string | null;
  warehouse_id: number;
  warehouse_name: string;
  warehouse_code: string;
  quantity: number;
  reorder_level: number;
  is_out_of_stock: boolean;
  last_alerted_at: string | null;
}

export interface LowStockAlertsResponse {
  count: number;
  results: LowStockAlertItem[];
}


