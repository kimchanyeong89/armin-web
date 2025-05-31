// src/components/ExhibitionBanner.tsx
import React, { useEffect, useState } from "react";
import "../styles/ExhibitionBanner.css";

const exhibitionBanners = [
  { id: 1, image: "/images/exhibition1.png", title: "Van Gogh Special Exhibition" },
  { id: 2, image: "/images/exhibition2.png", title: "Modern Art in Berlin" },
  { id: 3, image: "/images/exhibition3.png", title: "Impressionists in Paris" },
  { id: 4, image: "/images/exhibition4.png", title: "Abstract Expressionism" },
];

const ExhibitionBanner: React.FC = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((prevIndex) => (prevIndex + 1) % exhibitionBanners.length);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="banner-container">
      <div
        className="banner-slider"
        style={{
          transform: `translateX(-${currentIndex * 100}%)`,
        }}
      >
        {exhibitionBanners.map((banner) => (
          <div key={banner.id} className="banner-slide">
            <img src={banner.image} alt={banner.title} />
            <div className="banner-caption">{banner.title}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ExhibitionBanner;