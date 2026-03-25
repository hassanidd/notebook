import type React from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SignupFormProps {
  onSwitchToLogin?: () => void;
}

export function SignupForm({ onSwitchToLogin }: SignupFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          placeholder="First name"
          value={firstName}
          onChange={(event) => setFirstName(event.target.value)}
        />
        <Input
          placeholder="Last name"
          value={lastName}
          onChange={(event) => setLastName(event.target.value)}
        />
      </div>
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
        Sign Up
      </Button>
      {onSwitchToLogin && (
        <Button type="button" variant="link" onClick={onSwitchToLogin}>
          Already have an account?
        </Button>
      )}
    </form>
  );
}
