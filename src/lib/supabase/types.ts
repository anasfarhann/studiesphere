/*
 * Hand-written to match supabase/migrations/0001_init.sql and 0003_save_elements.sql and 0004_client_stamped_deletes.sql, in the shape of
 * `supabase gen types typescript`. Regenerate once the Supabase project exists:
 *   pnpm exec supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          plan: string;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          plan?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          plan?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      subjects: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          color: string;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          name: string;
          color: string;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          name?: string;
          color?: string;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      notebooks: {
        Row: {
          id: string;
          owner_id: string;
          subject_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          subject_id: string;
          title: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          subject_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notebooks_subject_id_fkey";
            columns: ["subject_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "subjects";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
      pages: {
        Row: {
          id: string;
          owner_id: string;
          notebook_id: string;
          title: string;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          notebook_id: string;
          title?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          notebook_id?: string;
          title?: string;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pages_notebook_id_fkey";
            columns: ["notebook_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "notebooks";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
      canvas_elements: {
        Row: {
          id: string;
          owner_id: string;
          page_id: string;
          type: string;
          data: Json;
          z: number;
          deleted: boolean;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          page_id: string;
          type: string;
          data: Json;
          z: number;
          deleted?: boolean;
          updated_at: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          page_id?: string;
          type?: string;
          data?: Json;
          z?: number;
          deleted?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "canvas_elements_page_id_fkey";
            columns: ["page_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
      page_snapshots: {
        Row: {
          id: string;
          owner_id: string;
          page_id: string;
          elements: Json;
          element_count: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          page_id: string;
          elements: Json;
          element_count?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          page_id?: string;
          elements?: Json;
          element_count?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "page_snapshots_page_id_fkey";
            columns: ["page_id", "owner_id"];
            isOneToOne: false;
            referencedRelation: "pages";
            referencedColumns: ["id", "owner_id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      create_snapshot: {
        Args: { p_page: string; p_elements: Json };
        Returns: undefined;
      };
      save_elements: {
        Args: { p_page: string; p_rows: Json; p_deleted: Json };
        Returns: undefined;
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
