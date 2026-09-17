import { useEffect } from "react";
export default function Home() {
  useEffect(() => { window.location.replace("/index.html"); }, []);
  return null;
}
