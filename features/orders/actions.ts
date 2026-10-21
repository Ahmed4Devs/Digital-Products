"use server";

import { z } from "zod";
import { actionFailure, type ActionState } from "@/lib/actions";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { configuredProviders } from "@/lib/payments";
import { refundOrder, resendReceipt, setItemAccess } from "./admin-service";

// Owner Server Actions for orders: owner check → validation → audited service.

const id = z.uuid();

export async function resendReceiptAction(orderId: string): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await resendReceipt(getDb(), owner.id, id.parse(orderId));
    return { status: "success", message: "receiptSent" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function refundOrderAction(orderId: string): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    const result = await refundOrder(getDb(), configuredProviders(), owner.id, id.parse(orderId));
    return {
      status: "success",
      message: result === "refunded" ? "orderRefunded" : "refundPending",
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function setItemAccessAction(
  orderId: string,
  orderItemId: string,
  active: boolean,
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await setItemAccess(
      getDb(),
      owner.id,
      id.parse(orderId),
      id.parse(orderItemId),
      z.boolean().parse(active),
    );
    return { status: "success", message: active ? "accessGranted" : "accessRevoked" };
  } catch (error) {
    return actionFailure(error);
  }
}
