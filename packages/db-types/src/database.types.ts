export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bloqueo: {
        Row: {
          created_at: string
          fin: string
          id: string
          inicio: string
          motivo: string | null
          negocio_id: string
          profesional_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fin: string
          id?: string
          inicio: string
          motivo?: string | null
          negocio_id: string
          profesional_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fin?: string
          id?: string
          inicio?: string
          motivo?: string | null
          negocio_id?: string
          profesional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bloqueo_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bloqueo_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      cliente: {
        Row: {
          created_at: string
          id: string
          negocio_id: string
          nombre: string | null
          telefono: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          negocio_id: string
          nombre?: string | null
          telefono: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          negocio_id?: string
          nombre?: string | null
          telefono?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cliente_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
        ]
      }
      conversacion: {
        Row: {
          cliente_id: string
          context: Json
          created_at: string
          id: string
          negocio_id: string
          updated_at: string
          ventana_expira_at: string | null
        }
        Insert: {
          cliente_id: string
          context?: Json
          created_at?: string
          id?: string
          negocio_id: string
          updated_at?: string
          ventana_expira_at?: string | null
        }
        Update: {
          cliente_id?: string
          context?: Json
          created_at?: string
          id?: string
          negocio_id?: string
          updated_at?: string
          ventana_expira_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversacion_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversacion_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
        ]
      }
      horario_trabajo: {
        Row: {
          activo: boolean
          created_at: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id: string
          negocio_id: string
          profesional_id: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          dia_semana: number
          hora_fin: string
          hora_inicio: string
          id?: string
          negocio_id: string
          profesional_id: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          dia_semana?: number
          hora_fin?: string
          hora_inicio?: string
          id?: string
          negocio_id?: string
          profesional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "horario_trabajo_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horario_trabajo_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      mensaje: {
        Row: {
          contenido: Json | null
          conversacion_id: string
          created_at: string
          direccion: string
          id: string
          negocio_id: string
          programado_en: string | null
          wa_message_id: string | null
        }
        Insert: {
          contenido?: Json | null
          conversacion_id: string
          created_at?: string
          direccion: string
          id?: string
          negocio_id: string
          programado_en?: string | null
          wa_message_id?: string | null
        }
        Update: {
          contenido?: Json | null
          conversacion_id?: string
          created_at?: string
          direccion?: string
          id?: string
          negocio_id?: string
          programado_en?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensaje_conversacion_id_fkey"
            columns: ["conversacion_id"]
            isOneToOne: false
            referencedRelation: "conversacion"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensaje_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
        ]
      }
      negocio: {
        Row: {
          activo: boolean
          created_at: string
          direccion: string | null
          display_phone_number: string | null
          granularidad_min: number
          horario_general: Json | null
          id: string
          nombre: string
          telefono: string | null
          tenant_id: string
          timezone: string
          updated_at: string
          waba_id: string | null
          whatsapp_phone_number_id: string | null
          whatsapp_token_secret_id: string | null
        }
        Insert: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          display_phone_number?: string | null
          granularidad_min?: number
          horario_general?: Json | null
          id?: string
          nombre: string
          telefono?: string | null
          tenant_id: string
          timezone?: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_token_secret_id?: string | null
        }
        Update: {
          activo?: boolean
          created_at?: string
          direccion?: string | null
          display_phone_number?: string | null
          granularidad_min?: number
          horario_general?: Json | null
          id?: string
          nombre?: string
          telefono?: string | null
          tenant_id?: string
          timezone?: string
          updated_at?: string
          waba_id?: string | null
          whatsapp_phone_number_id?: string | null
          whatsapp_token_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "negocio_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      perfil: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          rol: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id: string
          rol?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          rol?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "perfil_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      profesional: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          negocio_id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          negocio_id: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          negocio_id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profesional_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
        ]
      }
      profesional_servicio: {
        Row: {
          created_at: string
          id: string
          negocio_id: string
          precio_custom: number | null
          profesional_id: string
          servicio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          negocio_id: string
          precio_custom?: number | null
          profesional_id: string
          servicio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          negocio_id?: string
          precio_custom?: number | null
          profesional_id?: string
          servicio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profesional_servicio_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profesional_servicio_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profesional_servicio_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicio"
            referencedColumns: ["id"]
          },
        ]
      }
      recordatorio: {
        Row: {
          created_at: string
          enviado: boolean
          enviado_en: string | null
          id: string
          negocio_id: string
          programado_en: string
          turno_id: string
        }
        Insert: {
          created_at?: string
          enviado?: boolean
          enviado_en?: string | null
          id?: string
          negocio_id: string
          programado_en: string
          turno_id: string
        }
        Update: {
          created_at?: string
          enviado?: boolean
          enviado_en?: string | null
          id?: string
          negocio_id?: string
          programado_en?: string
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recordatorio_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recordatorio_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno"
            referencedColumns: ["id"]
          },
        ]
      }
      servicio: {
        Row: {
          activo: boolean
          created_at: string
          descripcion: string | null
          duracion_min: number
          id: string
          negocio_id: string
          nombre: string
          orden: number
          precio: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          duracion_min: number
          id?: string
          negocio_id: string
          nombre: string
          orden?: number
          precio: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          descripcion?: string | null
          duracion_min?: number
          id?: string
          negocio_id?: string
          nombre?: string
          orden?: number
          precio?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servicio_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      turno: {
        Row: {
          cliente_id: string
          created_at: string
          estado: string
          fin: string
          id: string
          inicio: string
          negocio_id: string
          precio_total: number | null
          profesional_id: string
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          estado?: string
          fin: string
          id?: string
          inicio: string
          negocio_id: string
          precio_total?: number | null
          profesional_id: string
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          estado?: string
          fin?: string
          id?: string
          inicio?: string
          negocio_id?: string
          precio_total?: number | null
          profesional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "turno_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "cliente"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_profesional_id_fkey"
            columns: ["profesional_id"]
            isOneToOne: false
            referencedRelation: "profesional"
            referencedColumns: ["id"]
          },
        ]
      }
      turno_servicio: {
        Row: {
          created_at: string
          duracion_snapshot: number
          id: string
          negocio_id: string
          nombre_snapshot: string
          precio_snapshot: number
          servicio_id: string
          turno_id: string
        }
        Insert: {
          created_at?: string
          duracion_snapshot: number
          id?: string
          negocio_id: string
          nombre_snapshot: string
          precio_snapshot: number
          servicio_id: string
          turno_id: string
        }
        Update: {
          created_at?: string
          duracion_snapshot?: number
          id?: string
          negocio_id?: string
          nombre_snapshot?: string
          precio_snapshot?: number
          servicio_id?: string
          turno_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "turno_servicio_negocio_id_fkey"
            columns: ["negocio_id"]
            isOneToOne: false
            referencedRelation: "negocio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_servicio_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicio"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "turno_servicio_turno_id_fkey"
            columns: ["turno_id"]
            isOneToOne: false
            referencedRelation: "turno"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auth_negocio_ids: { Args: never; Returns: string[] }
      auth_tenant_id: { Args: never; Returns: string }
      get_whatsapp_token: {
        Args: { p_negocio_id: string }
        Returns: string
      }
      set_whatsapp_token_secret: {
        Args: { p_name: string; p_negocio_id: string; p_token: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
