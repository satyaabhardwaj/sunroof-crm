import { applyView } from "../../../backend/react/src/view";
import { createRoot } from "react-dom/client";
import { DepartmentApp } from "./sunroof/Departments";
applyView();
createRoot(document.getElementById("app")!).render(<DepartmentApp />);
