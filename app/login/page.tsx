import { signupAllowed } from "./signup-config";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return <LoginForm allowSignup={signupAllowed()} />;
}
