import React, { useEffect, useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import ReceiveSharingIntent from 'react-native-receive-sharing-intent';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// Configuración de Supabase
const supabaseUrl = '..........................'; // Reemplaza con tu URL de Supabase
const supabaseAnonKey = '.......................'; // Reemplaza con tu clave Anon
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Configuración de OpenAI
const openAiApiKey = '...........................'; // Reemplaza con tu clave API de OpenAI
const openAiEndpoint = '.............................'; // Modifica según el servicio de OpenAI

const App: React.FC = () => {
  const [sharedImage, setSharedImage] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  useEffect(() => {
    // Escuchar contenido compartido
    ReceiveSharingIntent.getReceivedFiles(
      (files: any[]) => {
        if (files.length > 0) {
          const filePath = files[0].filePath;
          setSharedImage(filePath); // Muestra la imagen compartida
          uploadToSupabase(filePath); // Sube la imagen a Supabase
        }
      },
      (error: any) => {
        console.error('Error al recibir contenido compartido:', error);
      },
      'RNSharingGroup'
    );

    return () => {
      ReceiveSharingIntent.clearReceivedFiles();
    };
  }, []);

  const uploadToSupabase = async (filePath: string) => {
    try {
      const response = await fetch(filePath);
      const blob = await response.blob();
      const fileName = filePath.split('/').pop();

      // Subir imagen a Supabase
      const { data, error } = await supabase.storage
        .from('imagenes') // Bucket de Supabase
        .upload(`compartidas/${fileName}`, blob);

      if (error) {
        console.error('Error al subir la imagen:', error.message);
        setUploadStatus('Error al subir la imagen.');
      } else {
        console.log('Imagen subida correctamente:', data);
        setUploadStatus('Imagen subida correctamente a Supabase.');

        // Procesar imagen con OpenAI
        const imageUrl = `${supabaseUrl}/storage/v1/object/public/imagenes/${data.path}`;
        processImageWithOpenAI(imageUrl);
      }
    } catch (error) {
      console.error('Error al subir a Supabase:', error);
      setUploadStatus('Error inesperado al subir la imagen.');
    }
  };

  const processImageWithOpenAI = async (imageUrl: string) => {
    try {
      const response = await axios.post(
        openAiEndpoint,
        {
          image_url: imageUrl,
          model: 'gpt-4', // GPT-4 Modifica según el modelo que uses
        },
        {
          headers: {
            Authorization: `Bearer ${openAiApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 200) {
        console.log('Imagen procesada con éxito:', response.data);
        setUploadStatus('Imagen procesada correctamente con OpenAI.');
      } else {
        console.error('Error al procesar la imagen:', response.data);
        setUploadStatus('Error al procesar la imagen con GPT-4.');
      }
    } catch (error) {
      console.error('Error de conexión con OpenAI:', error);
      setUploadStatus('Error al conectar con GPT-4.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Imagen Compartida</Text>
      {sharedImage ? (
        <Image source={{ uri: sharedImage }} style={styles.image} />
      ) : (
        <Text>No se ha compartido ninguna imagen.</Text>
      )}
      {uploadStatus && <Text>{uploadStatus}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 20,
    marginBottom: 20,
  },
  image: {
    width: 300,
    height: 300,
    resizeMode: 'contain',
  },
});

export default App;
