import { AuthProvider } from "./contexts/AuthContext";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ArtistPage from "./pages/ArtistPage"; // 추가
import WorkPage from "./pages/WorkPage"; // 추가
import ExhibitionPage from "./pages/ExhibitionPage"; // 추가
import { exhibitions } from "./data/exhibitions.js";
import Login from "./components/Login";
import SignUp from "./components/SignUp";
import Navbar from "./components/Navbar";  // 추가

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/" element={<HomePage exhibitions={exhibitions} />} />
          <Route path="/artist/:id" element={<ArtistPage />} />
          <Route path="/work/:id" element={<WorkPage />} />
          <Route path="/exhibition/:id" element={<ExhibitionPage exhibitions={exhibitions} />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;