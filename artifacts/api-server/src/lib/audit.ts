import { Request } from "express";
import { db } from "@workspace/db";
import { auditLogsTable } from "@workspace/db/schema";

export interface AuditParams {
  action: string;
  entity: string;
  entityId?: string | number | null;
  description: string;
  metadata?: Record<string, any> | null;
}

export async function logAudit(req: Request, params: AuditParams): Promise<void> {
  try {
    const session = (req.session as any);
    await db.insert(auditLogsTable).values({
      userId: session?.userId ?? null,
      userName: session?.userName ?? "System",
      action: params.action,
      entity: params.entity,
      entityId: params.entityId != null ? String(params.entityId) : null,
      description: params.description,
      metadata: params.metadata ?? null,
      ipAddress: req.ip ?? req.socket?.remoteAddress ?? null,
    });
  } catch (e) {
    console.error("[audit] Failed to write audit log:", e);
  }
}
