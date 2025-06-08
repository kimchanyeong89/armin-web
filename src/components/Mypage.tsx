import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { getFirestore, collection, getDocs, getDoc, doc } from "firebase/firestore";

const MyPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [likedArtworks, setLikedArtworks] = useState<any[]>([]);
  const [likedExhibitions, setLikedExhibitions] = useState<any[]>([]);

  const [visitedCount, setVisitedCount] = useState<number>(0);
  const [likedCount, setLikedCount] = useState<number>(0);

  const [viewMode, setViewMode] = useState<"artworks" | "exhibitions">("artworks");
  const [sortMode, setSortMode] = useState<"year" | "likes" | "recent">("recent");

  useEffect(() => {
    if (!user) {
      navigate("/");
      return;
    }

    const fetchData = async () => {
      try {
        const db = getFirestore();

        const [artworksSnapshot, exhibitionsSnapshot] = await Promise.all([
          getDocs(collection(db, "likedArtworks")),
          getDocs(collection(db, "likedExhibitions"))
        ]);
        setLikedArtworks(artworksSnapshot.docs.map(doc => doc.data()));
        setLikedExhibitions(exhibitionsSnapshot.docs.map(doc => doc.data()));

        const visitedRef = doc(db, "users", user.uid, "counters", "visitedExhibitionsCount");
        const likedRef = doc(db, "users", user.uid, "counters", "likedArtworksCount");

        const [visitedSnap, likedSnap] = await Promise.all([
          getDoc(visitedRef),
          getDoc(likedRef)
        ]);

        setVisitedCount(visitedSnap.exists() ? visitedSnap.data().count : 0);
        setLikedCount(likedSnap.exists() ? likedSnap.data().count : 0);

      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user, navigate]);

  // useState로 닉네임 설정
  const [nickname, setNickname] = useState("RandomUser123");

  if (loading) {
    return <div>Loading...</div>;
  }

  // 프로필 이미지 크기와 중앙 정렬 수정
  return (
    <div style={{ padding: "20px", display: "flex", flexDirection: "column", alignItems: "center" }}>
      {/* 프로필 사진 + 닉네임, 이메일 영역 */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: "20px" }}>
        <div
          style={{
            width: "100px",
            height: "100px",
            borderRadius: "50%",
            backgroundColor: "#ccc",
            marginRight: "20px",
            cursor: "pointer"
          }}
          onClick={() => alert("프로필 사진 업로드 기능 추가 예정")}
        />
        <div>
          <div style={{ fontSize: "18px", fontWeight: "bold" }}>{nickname}</div>
          <div style={{ fontSize: "14px", color: "#555" }}>{user?.email || "ID"}</div>
        </div>
      </div>

      {/* 카운터 영역 수정 */}
      <div style={{ display: "flex", justifyContent: "space-around", margin: "20px 0", textAlign: "center", width: "100%" }}>
        <div>
          <div>즐겨찾는 전시관</div>
          <div style={{ fontSize: "24px", fontWeight: "bold" }}>0</div>
        </div>
        <div>
          <div>내가 간 전시</div>
          <div style={{ fontSize: "24px", fontWeight: "bold" }}>{visitedCount}</div>
        </div>
        <div>
          <div>좋아하는 작품</div>
          <div style={{ fontSize: "24px", fontWeight: "bold" }}>{likedCount}</div>
        </div>
      </div>

      {/* 작품/전시 전환 버튼과 정렬 버튼 함께 배치 */}
      <div style={{ display: "flex", justifyContent: "flex-start", gap: "20px", marginBottom: "20px", marginTop: "20px", width: "100%", paddingLeft: "40px" }}>
        <ViewModeDropdown viewMode={viewMode} setViewMode={setViewMode} />
        <SortDropdown sortMode={sortMode} setSortMode={setSortMode} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "10px"
        }}
      >
        {(viewMode === "artworks" ? likedArtworks : likedExhibitions).map((item, i) => (
          <div
            key={i}
            style={{
              position: "relative",
              width: "100%",
              height: "120px",
              background: "#ccc",
              overflow: "hidden"
            }}
          >
            {viewMode === "artworks" ? item.title : item.name}
            {/* 호버 시 하트/체크 표시 */}
            <div
              style={{
                position: "absolute",
                top: "5px",
                right: "5px",
                display: "flex",
                gap: "5px",
                opacity: 0,
                transition: "opacity 0.3s"
              }}
              className="hover-icons"
            >
              <span style={{ fontSize: "20px", cursor: "pointer" }}>♡</span>
              <span style={{ fontSize: "20px", cursor: "pointer" }}>☑️</span>
            </div>
          </div>
        ))}
      </div>

      {/* hover effect css */}
      <style>
        {`
          .hover-icons:hover {
            opacity: 1 !important;
          }

          div:hover .hover-icons {
            opacity: 1;
          }
        `}
      </style>
    </div>
  );
};

export default MyPage;
// SortDropdown dropdown with open/close state
const SortDropdown: React.FC<{
  sortMode: "year" | "likes" | "recent";
  setSortMode: (mode: "year" | "likes" | "recent") => void;
}> = ({ sortMode, setSortMode }) => {
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setSortDropdownOpen(!sortDropdownOpen)}>
        {sortMode === "year"
          ? "작품년도순"
          : sortMode === "likes"
          ? "좋아요순"
          : "최신순"}
      </button>
      {sortDropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "30px",
            left: 0,
            background: "white",
            border: "1px solid #ccc",
            zIndex: 1,
          }}
        >
          <div
            style={{ padding: "5px", cursor: "pointer" }}
            onClick={() => {
              setSortMode("year");
              setSortDropdownOpen(false);
            }}
          >
            작품년도순
          </div>
          <div
            style={{ padding: "5px", cursor: "pointer" }}
            onClick={() => {
              setSortMode("likes");
              setSortDropdownOpen(false);
            }}
          >
            좋아요순
          </div>
          <div
            style={{ padding: "5px", cursor: "pointer" }}
            onClick={() => {
              setSortMode("recent");
              setSortDropdownOpen(false);
            }}
          >
            최신순
          </div>
        </div>
      )}
    </div>
  );
};
// ViewModeDropdown dropdown with open/close state
const ViewModeDropdown: React.FC<{
  viewMode: "artworks" | "exhibitions";
  setViewMode: (mode: "artworks" | "exhibitions") => void;
}> = ({ viewMode, setViewMode }) => {
  const [viewDropdownOpen, setViewDropdownOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setViewDropdownOpen(!viewDropdownOpen)}>
        {viewMode === "artworks" ? "작품" : "전시"}
      </button>
      {viewDropdownOpen && (
        <div
          style={{
            position: "absolute",
            top: "30px",
            left: 0,
            background: "white",
            border: "1px solid #ccc",
            zIndex: 1,
          }}
        >
          <div
            style={{ padding: "5px", cursor: "pointer" }}
            onClick={() => {
              setViewMode("artworks");
              setViewDropdownOpen(false);
            }}
          >
            작품
          </div>
          <div
            style={{ padding: "5px", cursor: "pointer" }}
            onClick={() => {
              setViewMode("exhibitions");
              setViewDropdownOpen(false);
            }}
          >
            전시
          </div>
        </div>
      )}
    </div>
  );
};