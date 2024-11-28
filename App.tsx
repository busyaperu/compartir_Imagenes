import React, { useEffect } from "react";
import { View, Text, Image, Alert, Button } from "react-native";
import ShareMenu from "react-native-share-menu";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://uygczevnxayqgfaiuyuy.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV5Z2N6ZXZueGF5cWdmYWl1eXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDA5OTkwNDksImV4cCI6MjAxNjU3NTA0OX0.hgb12daiZVI3p6d8xAY-jyYwY3VmSQNp9nGeS0cymRo";
const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const handleShared = async (sharedData: any) => {
    if (!sharedData) return;

    const { mimeType, data, app } = sharedData;

    // Verificar que provenga de Yape o Plin
    const allowedApps = [
      "com.bcp.innovacxion.yapeapp", // Yape
      "com.bbva.pe.bbvacontigo",    // BBVA con Plin
      "com.interbank.mobilebanking", // Interbank con Plin
      "pe.scotiabank.banking",       // Scotiabank con Plin
      "pe.bn.movil",                 // Banco de la Nación
      "com.banbif.mobilebanking"     // BanBIF
    ];

    if (!allowedApps.includes(app)) {
      Alert.alert("Error", "Solo puedes compartir imágenes desde Yape o Plin.");
      return;
    }

    // Validar tipo de archivo
    if (!mimeType.startsWith("image/")) {
      Alert.alert("Error", "Por favor comparte una imagen.");
      return;
    }

    try {
      // Enviar la imagen al backend para procesarla con ChatGPT
      const response = await fetch("http://localhost:3000/process-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: data }),
      });
      const extractedData = await response.json();

      // Extraer datos y enviarlos a Supabase
      const { monto, nombre, email, telefono, banco } = extractedData;
      const { error } = await supabase.from("acreditar").insert([
        { monto, nombre, email, telefono, banco },
      ]);

      if (error) throw error;

      Alert.alert("Éxito", "Datos enviados correctamente a Supabase.");
    } catch (error) {
      Alert.alert("Error", (error as Error).message);

    }
  };

  useEffect(() => {
    const unsubscribe = ShareMenu.addListener(handleShared);
    return () => unsubscribe.remove();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      {/* Asegúrate de tener la carpeta `assets/images` con el logo `logo1.png` */}
      <Image source={require("./assets/images/logo1.png")} style={{ width: 100, height: 100 }} />
      <Text style={{ marginTop: 20 }}>BusyaTransfer</Text>
    </View>
  );
}
