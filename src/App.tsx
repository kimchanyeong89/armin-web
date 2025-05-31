import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ArtistPage from "./pages/ArtistPage"; // 추가
import WorkPage from "./pages/WorkPage"; // 추가
import ExhibitionPage from "./pages/ExhibitionPage"; // 추가

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/artist/:id" element={<ArtistPage />} />
        <Route path="/work/:id" element={<WorkPage />} />
        <Route path="/exhibition/:id" element={<ExhibitionPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;