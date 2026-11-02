import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/manrope";
import "./styles.css";
import "./responsive.css";
import { DataProvider } from "./data";
import { AppLayout } from "./layout";
import { VerifyReceipt } from "./verify";
import { Landing } from "./landing";
import { Overview, Agents, Receipts, Protocol } from "./pages";
import { NewJob } from "./new-job";
import { JobDetail, BuildDetail, NotFound } from "./details";

function App() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title =
      location.pathname === "/"
        ? "Sealwork — Private records. Proof before payment."
        : "Sealwork workspace — Private work, inspectable outcomes";
  }, [location.pathname]);
  return (
    <DataProvider>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route element={<AppLayout />}>
          <Route path="/workspace" element={<Overview />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/receipts" element={<Receipts />} />
          <Route path="/protocol" element={<Protocol />} />
          <Route path="/verify/:id" element={<VerifyReceipt />} />
          <Route path="/new" element={<NewJob />} />
          <Route
            path="/jobs/:id"
            element={<JobDetail key={location.pathname} />}
          />
          <Route
            path="/builds/:hash"
            element={<BuildDetail key={location.pathname} />}
          />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </DataProvider>
  );
}
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
