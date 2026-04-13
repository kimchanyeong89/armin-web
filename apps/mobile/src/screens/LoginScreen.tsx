import React from "react";
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

type LoginScreenProps = {
  loading: boolean;
  errorMessage?: string | null;
  onContinue: () => void;
};

export function LoginScreen({ loading, errorMessage, onContinue }: LoginScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>ARMIN Mobile</Text>
          <Text style={styles.subtitle}>로그인 후 취향 기반 추천을 시작해보세요.</Text>

        {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

        <Pressable
          style={[styles.button, loading && styles.buttonDisabled]}
          disabled={loading}
          onPress={onContinue}
        >
          {loading ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.buttonLabel}>로그인 시작</Text>}
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
    gap: 10,
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: "#1f2937",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: "#4b5563",
    marginBottom: 18,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#b91c1c",
    backgroundColor: "#fee2e2",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  button: {
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
