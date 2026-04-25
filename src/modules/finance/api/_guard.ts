/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionUser, type SessionUser } from '@/lib/auth';
import { hasPermission, type Permission } from '@/lib/permissions';

export type FinanceHandler<TCtx = unknown> = (
  request: NextRequest,
  context: TCtx,
) => Promise<NextResponse | Response>;

async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const sessionId = store.get('session_id')?.value;
  return getSessionUser(sessionId);
}

/**
 * Wrap a finance handler with a permission check.
 *
 * Returns 401 if no session, 403 if the user lacks the permission, otherwise
 * delegates to the handler. The internal payment-bridge functions
 * (createPaymentOperation, deletePaymentOperationsForReservation) are NOT
 * wrapped — they are called from other modules (hostex sync, teia webhook,
 * widget checkout) without an HTTP request context.
 */
export function withPermission<TCtx = unknown>(
  permission: Permission,
  handler: FinanceHandler<TCtx>,
): FinanceHandler<TCtx> {
  return async (request, context) => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Не авторизовано', code: 'UNAUTHENTICATED' },
        { status: 401 },
      );
    }
    if (!hasPermission(user.permissions, permission)) {
      return NextResponse.json(
        { error: `Недостатньо прав. Потрібен дозвіл: ${permission}`, code: 'FORBIDDEN', required: permission },
        { status: 403 },
      );
    }
    return handler(request, context);
  };
}

/**
 * Wrap a finance handler that requires ANY of the given permissions.
 * Useful for handlers usable by multiple roles (e.g. operations CRUD allowed
 * for both manage_payments and manage_finance_settings).
 */
export function withAnyPermission<TCtx = unknown>(
  permissions: Permission[],
  handler: FinanceHandler<TCtx>,
): FinanceHandler<TCtx> {
  return async (request, context) => {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Не авторизовано', code: 'UNAUTHENTICATED' },
        { status: 401 },
      );
    }
    const ok = permissions.some((p) => hasPermission(user.permissions, p));
    if (!ok) {
      return NextResponse.json(
        { error: `Недостатньо прав. Потрібен один з дозволів: ${permissions.join(', ')}`, code: 'FORBIDDEN', required: permissions },
        { status: 403 },
      );
    }
    return handler(request, context);
  };
}
