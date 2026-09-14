// Generiert aus dem Supabase-Schema (MCP generate_typescript_types). Nicht von Hand ändern.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          account_type: string;
          created_at: string;
          currency: string;
          drawdown_type: string;
          firm: string | null;
          id: string;
          market: string;
          max_daily_loss: number | null;
          max_drawdown: number | null;
          min_trading_days: number | null;
          name: string;
          notes: string | null;
          phase: string;
          platform: string;
          profit_target: number | null;
          starting_balance: number;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_type?: string;
          created_at?: string;
          currency?: string;
          drawdown_type?: string;
          firm?: string | null;
          id?: string;
          market?: string;
          max_daily_loss?: number | null;
          max_drawdown?: number | null;
          min_trading_days?: number | null;
          name: string;
          notes?: string | null;
          phase?: string;
          platform?: string;
          profit_target?: number | null;
          starting_balance: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Insert"]>;
        Relationships: [];
      };
      daily_plans: {
        Row: {
          created_at: string;
          discipline: number | null;
          energy: number | null;
          focus: string | null;
          followed_plan: boolean | null;
          id: string;
          lesson: string | null;
          markets: Json;
          max_losses: number | null;
          max_trades: number | null;
          mood_after: number | null;
          mood_before: number | null;
          news_notes: string | null;
          plan_date: string;
          premarket_notes: string | null;
          reviewed_at: string | null;
          routine: Json;
          strategy_ids: string[];
          to_improve: string | null;
          updated_at: string;
          user_id: string;
          went_well: string | null;
        };
        Insert: {
          created_at?: string;
          discipline?: number | null;
          energy?: number | null;
          focus?: string | null;
          followed_plan?: boolean | null;
          id?: string;
          lesson?: string | null;
          markets?: Json;
          max_losses?: number | null;
          max_trades?: number | null;
          mood_after?: number | null;
          mood_before?: number | null;
          news_notes?: string | null;
          plan_date: string;
          premarket_notes?: string | null;
          reviewed_at?: string | null;
          routine?: Json;
          strategy_ids?: string[];
          to_improve?: string | null;
          updated_at?: string;
          user_id?: string;
          went_well?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["daily_plans"]["Insert"]>;
        Relationships: [];
      };
      import_batches: {
        Row: {
          account_id: string;
          created_at: string;
          file_name: string;
          id: string;
          imported_count: number;
          skipped_count: number;
          source: string;
          total_count: number;
          user_id: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          file_name: string;
          id?: string;
          imported_count?: number;
          skipped_count?: number;
          source: string;
          total_count?: number;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["import_batches"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "import_batches_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      playbook_notes: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          pinned: boolean;
          search: unknown;
          strategy_id: string | null;
          tags: string[];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          id?: string;
          pinned?: boolean;
          strategy_id?: string | null;
          tags?: string[];
          title: string;
          updated_at?: string;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["playbook_notes"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "playbook_notes_strategy_id_fkey";
            columns: ["strategy_id"];
            isOneToOne: false;
            referencedRelation: "strategies";
            referencedColumns: ["id"];
          },
        ];
      };
      strategies: {
        Row: {
          created_at: string;
          entry_rules: string | null;
          exit_rules: string | null;
          id: string;
          markets: string[];
          name: string;
          notes: string | null;
          risk_rules: string | null;
          status: string;
          summary: string | null;
          timeframes: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          entry_rules?: string | null;
          exit_rules?: string | null;
          id?: string;
          markets?: string[];
          name: string;
          notes?: string | null;
          risk_rules?: string | null;
          status?: string;
          summary?: string | null;
          timeframes?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["strategies"]["Insert"]>;
        Relationships: [];
      };
      strategy_checklist_items: {
        Row: {
          created_at: string;
          id: string;
          label: string;
          position: number;
          strategy_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          label: string;
          position?: number;
          strategy_id: string;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["strategy_checklist_items"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "strategy_checklist_items_strategy_id_fkey";
            columns: ["strategy_id"];
            isOneToOne: false;
            referencedRelation: "strategies";
            referencedColumns: ["id"];
          },
        ];
      };
      user_settings: {
        Row: {
          calendar_currencies: string[];
          calendar_min_impact: string;
          created_at: string;
          news_sources: string[];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          calendar_currencies?: string[];
          calendar_min_impact?: string;
          created_at?: string;
          news_sources?: string[];
          updated_at?: string;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["user_settings"]["Insert"]>;
        Relationships: [];
      };
      trade_checklist_results: {
        Row: {
          checked: boolean;
          item_id: string;
          trade_id: string;
          user_id: string;
        };
        Insert: {
          checked: boolean;
          item_id: string;
          trade_id: string;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["trade_checklist_results"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "trade_checklist_results_item_id_fkey";
            columns: ["item_id"];
            isOneToOne: false;
            referencedRelation: "strategy_checklist_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trade_checklist_results_trade_id_fkey";
            columns: ["trade_id"];
            isOneToOne: false;
            referencedRelation: "trades";
            referencedColumns: ["id"];
          },
        ];
      };
      trade_screenshots: {
        Row: {
          caption: string | null;
          created_at: string;
          id: string;
          storage_path: string;
          trade_id: string;
          user_id: string;
        };
        Insert: {
          caption?: string | null;
          created_at?: string;
          id?: string;
          storage_path: string;
          trade_id: string;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["trade_screenshots"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "trade_screenshots_trade_id_fkey";
            columns: ["trade_id"];
            isOneToOne: false;
            referencedRelation: "trades";
            referencedColumns: ["id"];
          },
        ];
      };
      trades: {
        Row: {
          account_id: string;
          commission: number;
          created_at: string;
          direction: string;
          emotion: string | null;
          entry_price: number | null;
          entry_time: string;
          exit_price: number | null;
          exit_time: string | null;
          external_id: string | null;
          followed_plan: boolean | null;
          id: string;
          import_batch_id: string | null;
          is_backtest: boolean;
          lessons: string | null;
          mistakes: string[];
          net_pnl: number | null;
          notes: string | null;
          pnl: number | null;
          quantity: number;
          r_multiple: number | null;
          rating: number | null;
          risk_amount: number | null;
          session: string | null;
          setup_quality: string | null;
          source: string;
          status: string;
          stop_loss: number | null;
          strategy_id: string | null;
          swap: number;
          symbol: string;
          tags: string[];
          take_profit: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          commission?: number;
          created_at?: string;
          direction: string;
          emotion?: string | null;
          entry_price?: number | null;
          entry_time: string;
          exit_price?: number | null;
          exit_time?: string | null;
          external_id?: string | null;
          followed_plan?: boolean | null;
          id?: string;
          import_batch_id?: string | null;
          is_backtest?: boolean;
          lessons?: string | null;
          mistakes?: string[];
          notes?: string | null;
          pnl?: number | null;
          quantity: number;
          rating?: number | null;
          risk_amount?: number | null;
          session?: string | null;
          setup_quality?: string | null;
          source?: string;
          status?: string;
          stop_loss?: number | null;
          strategy_id?: string | null;
          swap?: number;
          symbol: string;
          tags?: string[];
          take_profit?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Update: Partial<Database["public"]["Tables"]["trades"]["Insert"]>;
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trades_import_batch_id_fkey";
            columns: ["import_batch_id"];
            isOneToOne: false;
            referencedRelation: "import_batches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trades_strategy_id_fkey";
            columns: ["strategy_id"];
            isOneToOne: false;
            referencedRelation: "strategies";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicTables = Database["public"]["Tables"];

export type Tables<T extends keyof PublicTables> = PublicTables[T]["Row"];
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]["Insert"];
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]["Update"];
