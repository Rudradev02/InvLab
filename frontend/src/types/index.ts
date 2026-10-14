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
    email: string;
  } | null;
  staff_count: number;
  created_at: string;
  updated_at: string;
}

export interface WarehouseOverview extends Warehouse {
  products_stocked: number;
  total_units: number;
  low_stock_count: number;
  sales_today: string;
  sales_30d: string;
  pending_transfers: number;
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
  movement_type: 'receive' | 'sale' | 'adjustment' | 'transfer_out' | 'transfer_in' | 'return';
  user: number;
  username: string;
  reference: string;
  created_at: string;
}

export interface SaleLine {
  id: number;
  product: Product;
  product_sku: string;
  product_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

export interface Sale {
  id: number;
  sale_number: string;
  warehouse: number;
  warehouse_name: string;
  warehouse_code: string;
  user: number;
  cashier_name: string;
  total_amount: string;
  notes: string;
  lines: SaleLine[];
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
