"use server";

import { z } from "zod";
import { refreshProductCaches } from "@/features/catalog-refresh";
import { actionFailure, fieldErrorsFrom, formDataObject, type ActionState } from "@/lib/actions";
import { requireOwner } from "@/lib/auth/dal";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server";
import { getStorage } from "@/lib/storage";
import { PRODUCT_STATUS_TARGETS, productFormSchema, type ProductStatusTarget } from "./schemas";
import { changeProductStatus, createProduct, deleteProduct, updateProduct } from "./service";
import {
  confirmUpload,
  removeProductFile,
  removeProductImage,
  requestUpload,
  type IssuedUpload,
  type UploadRequest,
} from "./uploads";

// Owner Server Actions for products. Each one re-checks the owner (hidden UI is not
// security, spec §5.1), validates with Zod, writes through the audited services and
// then invalidates the catalog caches.

const id = z.uuid();

function parseProductForm(formData: FormData) {
  return productFormSchema.safeParse(formDataObject(formData));
}

export async function createProductAction(
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    const product = await createProduct(getDb(), owner.id, parsed.data);
    refreshProductCaches(product.id);
    return { status: "success", message: "productCreated", id: product.id };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateProductAction(
  productId: string,
  _state: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const owner = await requireOwner();
  const parsed = parseProductForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "invalid",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
    };
  }
  try {
    await updateProduct(getDb(), owner.id, id.parse(productId), parsed.data);
    refreshProductCaches(productId);
    return { status: "success", message: "productSaved" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function changeProductStatusAction(
  productId: string,
  target: ProductStatusTarget,
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await changeProductStatus(
      getDb(),
      owner.id,
      id.parse(productId),
      z.enum(PRODUCT_STATUS_TARGETS).parse(target),
    );
    refreshProductCaches(productId);
    return { status: "success", message: target };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function deleteProductAction(productId: string): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await deleteProduct(getDb(), getStorage(), owner.id, id.parse(productId));
    refreshProductCaches(productId);
    return { status: "success", message: "productDeleted" };
  } catch (error) {
    return actionFailure(error);
  }
}

export type RequestUploadResult = ActionState & { upload?: IssuedUpload };

export async function requestUploadAction(request: UploadRequest): Promise<RequestUploadResult> {
  await requireOwner();
  try {
    const upload = await requestUpload(
      getDb(),
      getStorage(),
      serverEnv().BETTER_AUTH_SECRET,
      request,
    );
    return { status: "success", upload };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function confirmUploadAction(confirmation: {
  token: string;
  altAr?: string;
  altEn?: string;
}): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    const result = await confirmUpload(
      getDb(),
      getStorage(),
      serverEnv().BETTER_AUTH_SECRET,
      owner.id,
      confirmation,
    );
    refreshProductCaches(result.productId);
    return {
      status: "success",
      message: result.kind === "file" ? "fileAdded" : "imageAdded",
      id: result.id,
    };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function removeProductFileAction(
  productId: string,
  fileId: string,
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await removeProductFile(getDb(), getStorage(), owner.id, id.parse(productId), id.parse(fileId));
    refreshProductCaches(productId);
    return { status: "success", message: "fileRemoved" };
  } catch (error) {
    return actionFailure(error);
  }
}

export async function removeProductImageAction(
  productId: string,
  imageId: string,
): Promise<ActionState> {
  const owner = await requireOwner();
  try {
    await removeProductImage(
      getDb(),
      getStorage(),
      owner.id,
      id.parse(productId),
      id.parse(imageId),
    );
    refreshProductCaches(productId);
    return { status: "success", message: "imageRemoved" };
  } catch (error) {
    return actionFailure(error);
  }
}
