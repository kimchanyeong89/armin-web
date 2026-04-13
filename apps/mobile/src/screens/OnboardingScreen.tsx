import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native";

type OnboardingScreenProps = {
  loading: boolean;
  initialNickname?: string;
  onSubmit: (payload: { nickname: string; soulmateArtist: string }) => void;
};

export function OnboardingScreen({ loading, initialNickname, onSubmit }: OnboardingScreenProps) {
  const [nickname, setNickname] = useState(initialNickname || "");
  const [artist, setArtist] = useState("");

  const canSubmit = useMemo(() => nickname.trim().length >= 2, [nickname]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>온보딩</Text>
        <Text style={styles.subtitle}>프로필을 간단히 설정하면 추천 품질이 더 좋아집니다.</Text>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>닉네임</Text>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            placeholder="예: Armin Lover"
            style={styles.input}
            editable={!loading}
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.label}>소울메이트 작가 (선택)</Text>
          <TextInput
            value={artist}
            onChangeText={setArtist}
            placeholder="예: Claude Monet"
            style={styles.input}
            editable={!loading}
          />
        </View>

        <Pressable
          style={[styles.button, (!canSubmit || loading) && styles.buttonDisabled]}
          disabled={!canSubmit || loading}
          onPress={() => onSubmit({ nickname: nickname.trim(), soulmateArtist: artist.trim() })}
        >
          {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.buttonLabel}>시작하기</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f7f3ea",
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: "#1f2937",
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: "#4b5563",
    marginBottom: 8,
  },
  fieldWrap: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "600",
  },
  input: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: "#111827",
  },
  button: {
    marginTop: 8,
    backgroundColor: "#bfff0a",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonLabel: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 15,
  },
});
