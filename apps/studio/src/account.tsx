import { createContext, useContext } from "react";
import type { StudioAccountLinks } from "../core/document.js";
export const StudioAccountContext = createContext<StudioAccountLinks>({
  login: "/auth/login",
  account: null,
  home: null,
});
export const useStudioAccount = () => useContext(StudioAccountContext);
