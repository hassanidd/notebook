import type React from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginFormProps {
  onSwitchToSignUp?: () => void;
}

export function LoginForm({ onSwitchToSignUp }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <Input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <Button type="submit" className="w-full">
        Sign In
      </Button>
      {onSwitchToSignUp && (
        <Button type="button" variant="link" onClick={onSwitchToSignUp}>
          Create an account
        </Button>
      )}
    </form>
  );
}
