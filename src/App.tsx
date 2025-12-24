import { Suspense, lazy } from "react";
import { AuthProvider } from "./contexts/AuthContext";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { exhibitions } from "./data/exhibitions";
import Navbar from "./components/Navbar";

// Lazy load pages for code splitting
const HomePage = lazy(() => import("./pages/HomePage"));
const ArtistPage = lazy(() => import("./pages/ArtistPage"));
const WorkPage = lazy(() => import("./pages/WorkPage"));
const ExhibitionPage = lazy(() => import("./pages/ExhibitionPage"));
const Login = lazy(() => import("./components/Login"));
const SignUp = lazy(() => import("./components/SignUp"));
const MyPage = lazy(() => import("./components/Mypage"));
const AdminImport = lazy(() => import("./pages/AdminImport"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const TateModernPermanentPage = lazy(() => import("./pages/TateModernPermanentPage"));

// Loading fallback
const PageLoader = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh',
    background: '#0a0a0a',
    color: '#fff'
  }}>
    <div>Loading...</div>
  </div>
);

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<HomePage exhibitions={exhibitions} />} />
            <Route path="/artist/:id" element={<ArtistPage />} />
            <Route path="/work/:id" element={<WorkPage />} />
            <Route path="/exhibition/:id" element={<ExhibitionPage exhibitions={exhibitions} />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/mypage" element={<MyPage />} />
            <Route path="/admin/import" element={<AdminImport />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/tate-modern/permanent" element={<TateModernPermanentPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;