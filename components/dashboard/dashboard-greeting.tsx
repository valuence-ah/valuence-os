"use client";

import { useState, useEffect } from "react";

export function DashboardGreeting() {
  const [text, setText] = useState("Good morning");

  useEffect(() => {
    const h = new Date().getHours();
    const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    setText(`${greeting} · ${today}`);
  }, []);

  return <span suppressHydrationWarning>{text}</span>;
}
