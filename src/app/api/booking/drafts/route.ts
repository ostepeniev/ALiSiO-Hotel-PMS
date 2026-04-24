import { createBookingDraft, getBookingDraft, deleteBookingDraft, createBookingDraftOptions } from '@bookings/booking-drafts.handlers';
export const POST = createBookingDraft;
export const GET = getBookingDraft;
export const DELETE = deleteBookingDraft;
export const OPTIONS = createBookingDraftOptions;
