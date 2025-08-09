import type { ExhibitionItem } from "../types/Exhibition";
import type { Artwork } from "../types/Artwork";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { storage } from "../firebase";
import { useState, useCallback, useEffect } from "react";
import { collection, addDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";

// Room type for floor plan boxes
interface Room {
  id: string;
  name: string;
  top: string;
  left: string;
  width: string;
  height: string;
}

interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  onClose: () => void;
  // Add other props as needed
}

const ExhibitionModal = ({ exhibition, onClose }: ExhibitionModalProps) => {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [userRooms, setUserRooms] = useState<Room[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  // Upload progress state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); // 0-100
  const [uploadStage, setUploadStage] = useState<"idle" | "파일 업로드 중" | "데이터 저장 중" | "완료">("idle");

  // Load saved rooms from localStorage and subscribe to Firestore artworks
  useEffect(() => {
    const savedRooms = localStorage.getItem(`rooms_${exhibition.id}`);
    if (savedRooms) {
      try {
        const parsed: Room[] = JSON.parse(savedRooms);
        setUserRooms(parsed);
        if (!selectedRoom && parsed.length > 0) setSelectedRoom(parsed[0].id);
      } catch {}
    }
    // Subscribe to Firestore artworks for this exhibition
    const q = query(collection(db, "artworks"), where("exhibitionTitle", "==", exhibition.title));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: Artwork[] = [];
        snap.forEach((d) => list.push(d.data() as Artwork));
        // Merge snapshot with existing to avoid flicker (by id)
        setArtworks((prev) => {
          const map = new Map<string, Artwork>();
          [...prev, ...list].forEach((a) => { if (a?.id) map.set(a.id, a); });
          const merged = Array.from(map.values());
          localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(merged));
          return merged;
        });
      },
      (error) => {
        console.error("Firestore onSnapshot error:", error);
        // Fallback to localStorage cache if available
        const cached = localStorage.getItem(`artworks_${exhibition.id}`);
        if (cached) {
          try { setArtworks(JSON.parse(cached)); } catch {}
        }
      }
    );
    return () => {
      unsub();
    };
  }, [exhibition.id, exhibition.title, selectedRoom]);

  const handleAddRoom = () => {
    const nextRoomId = `Room ${userRooms.length + 1}`;
    const newRoom: Room = {
      id: nextRoomId,
      name: nextRoomId,
      top: "20px",
      left: `${20 + userRooms.length * 130}px`,
      width: "120px",
      height: "100px",
    };
    setUserRooms(prev => {
      const next = [...prev, newRoom];
      if (!selectedRoom) setSelectedRoom(newRoom.id);
      return next;
    });
  };

  const handleAddArtwork = useCallback(async () => {
    if (!selectedRoom) {
      alert("먼저 방을 선택해주세요!");
      return;
    }

    const currentRoom = selectedRoom;

    // 사용자 정보 입력
    const promptFields = () => {
      const name = prompt("작품 제목을 입력하세요:");
      const year = prompt("제작연도를 입력하세요:");
      const artist = prompt("작가 이름을 입력하세요: (선택)") || "";
      return { name, year, artist };
    };

    if (confirm("이미지를 업로드하시겠습니까? (취소 시 이미지 없이 등록됩니다.)")) {
      // 파일 input을 함수 내부에서 직접 처리
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      // change 이벤트를 Promise로 래핑
      const fileSelected = await new Promise<File | null>((resolve) => {
        fileInput.onchange = () => {
          resolve((fileInput.files && fileInput.files[0]) ? fileInput.files[0] : null);
          document.body.removeChild(fileInput);
        };
        fileInput.click();
      });

      if (fileSelected) {
        const { name, artist, year } = promptFields();
        if (name && year) {
          const artworkId = `artwork_${Date.now()}`;
          const imageRef = ref(storage, `images/${artworkId}/${fileSelected.name}`);
          try {
            // Start resumable upload with progress updates
            setIsUploading(true);
            setUploadStage("파일 업로드 중");
            setUploadProgress(0);

            const imageUrl: string = await new Promise((resolve, reject) => {
              const uploadTask = uploadBytesResumable(imageRef, fileSelected);
              uploadTask.on(
                "state_changed",
                (snapshot) => {
                  const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
                  setUploadProgress(pct);
                },
                (err) => {
                  reject(err);
                },
                async () => {
                  try {
                    setUploadStage("데이터 저장 중");
                    const url = await getDownloadURL(imageRef);
                    resolve(url);
                  } catch (e) {
                    reject(e);
                  }
                }
              );
            });

            const newArtwork: Artwork = {
              id: artworkId,
              name,
              artist,
              year: parseInt(year),
              image: imageUrl,
              roomId: currentRoom,
              exhibitionName: exhibition.name,
              exhibitionTitle: exhibition.title,
            };
            await addDoc(collection(db, "artworks"), newArtwork);
            setArtworks((prev: Artwork[]) => {
              const next = [...prev, newArtwork];
              localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(next));
              return next;
            });
            setUploadStage("완료");
            setUploadProgress(100);
            setTimeout(() => {
              setIsUploading(false);
              setUploadStage("idle");
              setUploadProgress(0);
            }, 600);
            alert("작품이 성공적으로 등록되었습니다!");
          } catch (error: any) {
            console.error("Firebase upload failed:", error);
            setIsUploading(false);
            setUploadStage("idle");
            setUploadProgress(0);
            const code = error?.code ? ` (${error.code})` : "";
            alert(`이미지 업로드에 실패했습니다${code}. 보안 규칙을 확인해주세요.`);
          }
        }
      }
    } else {
      // 이미지 없이 등록
      const { name, artist, year } = promptFields();
      if (name && year) {
        const newArtwork: Artwork = {
          id: `artwork_${Date.now()}`,
          name,
          artist,
          year: parseInt(year),
          image: "",
          roomId: currentRoom,
          exhibitionName: exhibition.name,
          exhibitionTitle: exhibition.title
        };
        try {
          await addDoc(collection(db, "artworks"), newArtwork);
          setArtworks((prev: Artwork[]) => {
            const next = [...prev, newArtwork];
            localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(next));
            return next;
          });
      } catch (error: any) {
        const code = error?.code ? ` (${error.code})` : "";
        alert(`작품 저장에 실패했습니다${code}. 보안 규칙을 확인해주세요.`);
        console.error("Firestore addDoc failed:", error);
          return;
        }
        alert("작품이 성공적으로 등록되었습니다!");
      }
    }
  }, [exhibition.name, exhibition.title, selectedRoom]);

  // Save rooms and artworks
  const handleSave = () => {
    localStorage.setItem(`rooms_${exhibition.id}`, JSON.stringify(userRooms));
    localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(artworks));
    alert("저장되었습니다. 관리자의 승인을 기다려주세요!");
  };

  const filteredArtworks: Artwork[] = selectedRoom
    ? artworks.filter(a => a.roomId === selectedRoom && a.exhibitionTitle === exhibition.title)
    : [];

  // ... rest of the component code ...
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000,
      }}
    >
      <div style={{ backgroundColor: "#fff", width: "80%", maxHeight: "90%", overflowY: "auto", padding: "20px", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.2)" }}>
        <button onClick={onClose} style={{ float: "right", border: "none", background: "transparent", fontSize: 20, cursor: "pointer" }}>✕</button>
        <h2 style={{ marginTop: 0 }}>{exhibition.name}</h2>
        <p style={{ color: "#666", marginTop: -8 }}>{exhibition.title}</p>

        {/* 플로어 플랜 */}
        <div style={{ marginBottom: "20px" }}>
          <div
            style={{
              width: "100%",
              height: "300px",
              backgroundColor: "#fff",
              border: "1px solid #ccc",
              position: "relative",
              overflowX: "auto",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "flex-start",
              padding: "10px",
            }}
          >
            {userRooms.length === 0 && (
              <div style={{ color: "#888" }}>아직 방이 없습니다. 아래 "방 추가" 버튼으로 방을 만들어주세요.</div>
            )}
            {userRooms.map((room) => (
              <div
                key={room.id}
                style={{
                  minWidth: room.width,
                  height: room.height,
                  backgroundColor: selectedRoom === room.id ? "#d0e8ff" : "#ddd",
                  border: "1px solid #aaa",
                  marginRight: "10px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer"
                }}
                onClick={() => setSelectedRoom(room.id)}
              >
                {room.name}
              </div>
            ))}
          </div>
        </div>

        {/* 방 클릭 시 작품 리스트 */}
        {selectedRoom && (
          <div>
            <h3>{selectedRoom}의 작품들</h3>
            {filteredArtworks.length > 0 ? (
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  marginTop: "10px",
                  flexWrap: "wrap"
                }}
              >
                {filteredArtworks.map((artwork) => (
                  <div
                    key={artwork.id}
                    style={{
                      width: "120px",
                      height: "160px",
                      backgroundColor: "#eee",
                      border: "1px solid #ccc",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      position: "relative"
                    }}
                  >
                    <div
                      style={{
                        width: "100px",
                        height: "100px",
                        backgroundColor: "#ccc",
                        marginBottom: "5px",
                        position: "relative",
                        cursor: artwork.image ? "pointer" : "default"
                      }}
                      onClick={() => {
                        if (artwork.image) setShowImageModal(artwork.image);
                      }}
                    >
                      {artwork.image ? (
                        <img src={artwork.image} alt={artwork.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : (
                        <span>이미지 없음</span>
                      )}
                    </div>
                    <div style={{ fontSize: "0.8rem", textAlign: "center" }}>
                      <strong>{artwork.name}</strong><br />
                      {artwork.artist} ({artwork.year})
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p>이곳에 선택한 방의 작품들이 나열됩니다.</p>
            )}
          </div>
        )}

        {/* 하단 액션 버튼 */}
        <div style={{ display: "flex", justifyContent: "flex-start", gap: "10px", marginTop: "20px" }}>
          <button onClick={handleAddRoom}>방 추가</button>
          <button onClick={handleAddArtwork}>작품 추가</button>
          <button onClick={handleSave}>저장하기</button>
        </div>
      </div>

      {/* 이미지 미리보기 모달 */}
      {showImageModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 11000,
          }}
          onClick={() => setShowImageModal(null)}
        >
          <div style={{ maxWidth: "90%", maxHeight: "90%" }}>
            <img src={showImageModal} alt="Artwork" style={{ width: "100%", height: "auto" }} />
          </div>
        </div>
      )}

      {/* 업로드 진행 오버레이 */}
      {isUploading && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            backgroundColor: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 12000,
          }}
        >
          <div
            style={{
              width: "360px",
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 6px 20px rgba(0,0,0,0.25)",
              padding: "18px 20px",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>이미지 업로드</div>
            <div style={{ color: "#555", fontSize: 14, marginBottom: 12 }}>
              {uploadStage === "파일 업로드 중" && "파일 업로드 중…"}
              {uploadStage === "데이터 저장 중" && "데이터 저장 중…"}
              {uploadStage === "완료" && "완료"}
            </div>
            <div style={{ height: 10, background: "#eee", borderRadius: 6, overflow: "hidden" }}>
              <div
                style={{
                  width: `${uploadProgress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #4da3ff, #1e7bff)",
                  transition: "width 120ms ease",
                }}
              />
            </div>
            <div style={{ textAlign: "right", marginTop: 8, fontSize: 12, color: "#333" }}>
              {uploadProgress}%
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExhibitionModal;