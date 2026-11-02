import { useState } from "react";
import Login from "./pages/visitor/login/login";
import SignUp from "./pages/visitor/signup/signup";

function App() {
  const [page, setPage] = useState<"login" | "signup">("login");

  return page === "login" ? (
    <Login onSignUp={() => setPage("signup")} />
  ) : (
    <SignUp onSignIn={() => setPage("login")} />
  );
}

export default App;