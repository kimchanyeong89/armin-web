import { useState, useEffect } from "react";
import type { ExhibitionItem } from "../types/Exhibition";
import artworksData from "../data/artworks";
import type { Artwork } from "../types/Artwork";

interface ExhibitionModalProps {
  exhibition: ExhibitionItem;
  onClose: () => void;
}

interface Room {
  id: string;
  name: string;
  top: string;
  left: string;
  width: string;
  height: string;
}

export default function ExhibitionModal({ exhibition, onClose }: ExhibitionModalProps) {
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [userRooms, setUserRooms] = useState<Room[]>([]);
  const [artworks, setArtworks] = useState<Artwork[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showImageModal, setShowImageModal] = useState<string | null>(null);
  // Hover 상태 개별 관리 대신 배열로 상태 관리로 수정

  // useState 추가 부분 수정
  const [hoveredArtworks, setHoveredArtworks] = useState<{ [key: string]: boolean }>({});

  // 대표 이미지 hover 상태 관리 변수 추가
  const [representativeHovered, setRepresentativeHovered] = useState(false);

  // hover 핸들러 수정
  const handleMouseEnter = (artworkId: string) => {
    setHoveredArtworks(prev => ({ ...prev, [artworkId]: true }));
  };

  const handleMouseLeave = (artworkId: string) => {
    setHoveredArtworks(prev => ({ ...prev, [artworkId]: false }));
  };

  useEffect(() => {
    const savedRooms = localStorage.getItem(`rooms_${exhibition.id}`);
    if (savedRooms) {
      setUserRooms(JSON.parse(savedRooms));
    }
    const savedArtworks = localStorage.getItem(`artworks_${exhibition.id}`);
    if (savedArtworks) {
      setArtworks(JSON.parse(savedArtworks));
    } else {
      setArtworks(artworksData);
    }
  }, [exhibition.id]);

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
    setUserRooms([...userRooms, newRoom]);
  };

  const handleAddArtwork = () => {
    if (!selectedRoom) {
      alert("먼저 방을 선택해주세요!");
      return;
    }

    if (confirm("이미지를 업로드하시겠습니까? (취소 시 이미지 없이 등록됩니다.)")) {
      const fileInput = document.createElement("input");
      fileInput.type = "file";
      fileInput.accept = "image/*";
      fileInput.style.display = "none";
      document.body.appendChild(fileInput);

      fileInput.addEventListener("change", (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            const image = reader.result as string;
            const name = prompt("작품 제목을 입력하세요:");
            const artist = prompt("작가 이름을 입력하세요:");
            const year = prompt("제작연도를 입력하세요:");
            if (name && artist && year) {
              const newArtwork: Artwork = {
                id: `artwork_${Date.now()}`,
                name,
                artist,
                year: parseInt(year),
                image,
                roomId: selectedRoom,
                exhibitionName: exhibition.name,
                exhibitionTitle: exhibition.title
              };
              setArtworks([...artworks, newArtwork]);
            }
          };
          reader.readAsDataURL(file);
        }
        document.body.removeChild(fileInput);
      });

      fileInput.click();
    } else {
      const name = prompt("작품 제목을 입력하세요:");
      const artist = prompt("작가 이름을 입력하세요:");
      const year = prompt("제작연도를 입력하세요:");
      if (name && artist && year) {
        const newArtwork: Artwork = {
          id: `artwork_${Date.now()}`,
          name,
          artist,
          year: parseInt(year),
          image: "",
          roomId: selectedRoom,
          exhibitionName: exhibition.name,
          exhibitionTitle: exhibition.title
        };
        setArtworks([...artworks, newArtwork]);
      }
    }
  };

  const handleSave = () => {
    localStorage.setItem(`rooms_${exhibition.id}`, JSON.stringify(userRooms));
    localStorage.setItem(`artworks_${exhibition.id}`, JSON.stringify(artworks));
    alert("저장되었습니다. 관리자의 승인을 기다려주세요!");
    // TODO: 여기에 서버로 전송 로직 추가 (관리자 승인 시스템 연동)
  };

  const filteredArtworks: Artwork[] =
    selectedRoom
      ? artworks.filter(
          (artwork) =>
            artwork.roomId === selectedRoom &&
            artwork.exhibitionTitle === exhibition.title
        )
      : [];

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      width: "100vw",
      height: "100vh",
      backgroundColor: "rgba(0,0,0,0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 3000,
    }}>
      <div style={{
        backgroundColor: "#fff",
        width: "80%",
        maxHeight: "90%",
        overflowY: "auto",
        padding: "20px",
      }}>
        <button onClick={onClose} style={{ float: "right" }}>닫기</button>

        {/* 대표 이미지와 설명글 */}
        <div style={{ display: "flex", marginBottom: "20px" }}>
          <div style={{ width: "50%", height: "200px", backgroundColor: "#ccc", position: "relative" }}>
            {/* 하트와 체크 아이콘 hover 시 표시, 우측 하단 위치 */}
            <div
              style={{
                position: "absolute",
                bottom: "5px",
                right: "5px",
                display: "flex",
                gap: "5px",
                opacity: representativeHovered ? 1 : 0,
                transition: "opacity 0.3s"
              }}
              onMouseEnter={() => setRepresentativeHovered(true)}
              onMouseLeave={() => setRepresentativeHovered(false)}
              className="hover-icons"
            >
              <span style={{ fontSize: "20px", cursor: "pointer" }}>♡</span>
              <span style={{ fontSize: "20px", cursor: "pointer" }}>☑️</span>
            </div>
          </div>
          <div style={{ width: "50%", paddingLeft: "20px" }}>
            <h2>{exhibition.name}</h2>
            <p>{exhibition.description}</p>
          </div>
        </div>

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
            {userRooms.map((room, index) => (
              <div
                key={index}
                style={{
                  minWidth: room.width,
                  height: room.height,
                  backgroundColor: "#ddd",
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
                    {/* 이미지와 hover 아이콘 */}
                    <div
                      style={{
                        width: "100px",
                        height: "100px",
                        backgroundColor: "#ccc",
                        marginBottom: "5px",
                        position: "relative",
                        cursor: artwork.image ? "pointer" : "default"
                      }}
                      onMouseEnter={() => handleMouseEnter(artwork.id)}
                      onMouseLeave={() => handleMouseLeave(artwork.id)}
                      onClick={() => {
                        if (artwork.image) {
                          setShowImageModal(artwork.image);
                        }
                      }}
                    >
                      {artwork.image ? (
                        <img
                          src={artwork.image}
                          alt={artwork.name}
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span>이미지 없음</span>
                      )}
                      {/* 하트 아이콘 hover 시 표시, 우측 하단 위치 */}
                      {hoveredArtworks[artwork.id] && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: "5px",
                            right: "5px",
                            display: "flex",
                            gap: "5px",
                            opacity: 1
                          }}
                        >
                          <span style={{ fontSize: "20px", cursor: "pointer" }}>♡</span>
                        </div>
                      )}
                    </div>
                    {/* 작품 설명 */}
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

        {/* 작품 추가 및 저장 버튼 */}
        <div style={{ display: "flex", justifyContent: "flex-start", gap: "10px", marginTop: "20px" }}>
          <button onClick={handleAddArtwork}>작품 추가</button>
          <button onClick={handleSave}>저장하기</button>
        </div>
      </div>

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
            zIndex: 4000,
          }}
          onClick={() => setShowImageModal(null)}
        >
          <div style={{ maxWidth: "90%", maxHeight: "90%" }}>
            <img
              src={showImageModal}
              alt="Artwork"
              style={{ width: "100%", height: "auto" }}
            />
          </div>
        </div>
      )}
      <style>
        {`
          div:hover .hover-icons {
            opacity: 1;
          }
        `}
      </style>
    </div>
  );
}