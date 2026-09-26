import { POST as activatePost } from "../../activate/route";

/**
 * Device registration for licensing = Keygate/local activate.
 * Desktop continues to use the same device identity (stable UUID in secure store).
 */
export const POST = activatePost;
