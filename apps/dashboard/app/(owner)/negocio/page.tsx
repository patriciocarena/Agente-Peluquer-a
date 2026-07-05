/**
 * app/(owner)/negocio/page.tsx — Perfil del negocio (BIZ-01/02/03).
 * Settings page inline (sin estado "crear", la fila `negocio` siempre existe
 * post-signup, 02-UI-SPEC §CRUD Interaction Pattern): carga el negocio
 * ACTIVO vía `getNegocioActivo()` (la ÚNICA fuente server-side, ya validada
 * contra el tenant del owner) y delega la edición a `negocio-form.tsx`
 * (Client Component).
 */
import { getNegocioActivo } from "@/lib/negocio-context";
import { NegocioForm } from "./negocio-form";

export default async function NegocioPage() {
  const { negocio } = await getNegocioActivo();

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="text-2xl font-semibold">Perfil del negocio</h1>
      <p className="text-sm text-muted-foreground">
        Datos generales de {negocio.nombre}.
      </p>
      <NegocioForm negocio={negocio} />
    </div>
  );
}
