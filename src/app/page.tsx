import { AuthForm } from "./(auth)/AuthForm";

/** The first page is the sign-in screen itself; signed-in visitors are sent to /app by the proxy. */
export default function Home() {
  return <AuthForm mode="login" />;
}
