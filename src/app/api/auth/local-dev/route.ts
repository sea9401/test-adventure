import { signIn } from "@/auth";
import {
  isLoopbackAuthRequest,
  readLocalDevAutoLoginConfig,
} from "@/lib/server/localDevAutoLogin";

export async function GET(request: Request) {
  if (!readLocalDevAutoLoginConfig() || !isLoopbackAuthRequest(request)) {
    return new Response(null, { status: 404 });
  }

  const destination = await signIn("local-dev", {
    redirect: false,
    redirectTo: "/",
  });
  return Response.redirect(new URL(destination, request.url), 303);
}
