import type { Database } from "@/lib/supabase/types";

export type Subject = Database["public"]["Tables"]["subjects"]["Row"];
export type Notebook = Database["public"]["Tables"]["notebooks"]["Row"];
export type Page = Database["public"]["Tables"]["pages"]["Row"];
