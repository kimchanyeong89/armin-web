import React from "react";
import { ActivityIndicator, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import type { AppUserProfile } from "@armin/shared/types/Profile";

type MyPageScreenProps = {
  profile: AppUserProfile | null;
  likedCount: number;
  likedArtworkIds: string[];
  sampleLiked: boolean;
  busy: boolean;
  recommendLoading: boolean;
  recommendations: Array<{ id: string; name: string; artist: string; image: string }>;
  onToggleSampleLike: () => void;
  onToggleRecommendationLike: (item: { id: string; name: string; artist: string; image: string }) => void;
  onRefreshRecommendations: () => void;
  onLogout: () => void;
};

export function MyPageScreen({
  profile,
  likedCount,
  likedArtworkIds,
  sampleLiked,
  busy,
  recommendLoading,
  recommendations,
  onToggleSampleLike,
  onToggleRecommendationLike,
  onRefreshRecommendations,
  onLogout,
}: MyPageScreenProps) {
  const displayName = profile?.nickname || profile?.displayName || "Guest";

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>마이페이지</Text>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.meta}>좋아요한 작품: {likedCount}개</Text>

        <Pressable
          style={[styles.primary, busy && styles.disabled]}
          onPress={onToggleSampleLike}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#0f172a" />
          ) : (
            <Text style={styles.primaryLabel}>{sampleLiked ? "샘플 좋아요 해제" : "샘플 작품 좋아요"}</Text>
          )}
        </Pressable>

        <View style={styles.recommendSection}>
          <View style={styles.recommendHeader}>
            <Text style={styles.recommendTitle}>추천 작품</Text>
            <Pressable
              style={[styles.refreshBtn, (busy || recommendLoading) && styles.disabled]}
              onPress={onRefreshRecommendations}
              disabled={busy || recommendLoading}
            >
              {recommendLoading ? <ActivityIndicator size="small" color="#0f172a" /> : <Text style={styles.refreshText}>새로고침</Text>}
            </Pressable>
          </View>

          {recommendations.length === 0 ? (
            <Text style={styles.emptyText}>좋아요를 더 누르면 추천이 채워집니다.</Text>
          ) : (
            recommendations.map((item) => (
              <View key={item.id} style={styles.recommendRow}>
                <View style={styles.recommendMainRow}>
                  <View style={styles.recommendThumbWrap}>
                  {item.image ? (
                    <Image
                      source={{ uri: item.image }}
                      style={styles.recommendThumb}
                      contentFit="cover"
                      cachePolicy="memory-disk"
                    />
                  ) : (
                    <View style={styles.recommendThumbFallback} />
                  )}
                  <View style={styles.recommendTextWrap}>
                    <Text style={styles.recommendName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.recommendArtist} numberOfLines={1}>{item.artist}</Text>
                  </View>
                  </View>

                  <Pressable
                    style={[
                      styles.likeButton,
                      likedArtworkIds.includes(item.id) && styles.likeButtonActive,
                      busy && styles.disabled,
                    ]}
                    disabled={busy}
                    onPress={() => onToggleRecommendationLike(item)}
                  >
                    <Text
                      style={[
                        styles.likeButtonLabel,
                        likedArtworkIds.includes(item.id) && styles.likeButtonLabelActive,
                      ]}
                    >
                      {likedArtworkIds.includes(item.id) ? "해제" : "좋아요"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </View>

        <Pressable style={styles.secondary} onPress={onLogout}>
          <Text style={styles.secondaryLabel}>로그아웃</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f3ea",
  },
  content: {
    paddingTop: 24,
    paddingBottom: 42,
    paddingHorizontal: 24,
    gap: 10,
  },
  title: {
    fontSize: 30,
    color: "#1f2937",
    fontWeight: "700",
  },
  name: {
    fontSize: 20,
    color: "#111827",
    fontWeight: "600",
  },
  meta: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 8,
  },
  recommendSection: {
    marginTop: 4,
    marginBottom: 8,
    backgroundColor: "#ffffff",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 8,
  },
  recommendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  recommendTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
  },
  refreshBtn: {
    backgroundColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  refreshText: {
    color: "#0f172a",
    fontWeight: "600",
    fontSize: 12,
  },
  emptyText: {
    fontSize: 12,
    color: "#6b7280",
  },
  recommendRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  recommendMainRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  recommendThumbWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  recommendTextWrap: {
    flex: 1,
  },
  recommendThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  recommendThumbFallback: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#e5e7eb",
  },
  recommendName: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  recommendArtist: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 2,
  },
  likeButton: {
    backgroundColor: "#e5e7eb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  likeButtonActive: {
    backgroundColor: "#bfff0a",
  },
  likeButtonLabel: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 11,
  },
  likeButtonLabelActive: {
    color: "#0f172a",
  },
  primary: {
    backgroundColor: "#bfff0a",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryLabel: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 15,
  },
  secondary: {
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryLabel: {
    color: "#f9fafb",
    fontWeight: "700",
    fontSize: 15,
  },
  disabled: {
    opacity: 0.6,
  },
});
