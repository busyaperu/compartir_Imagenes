const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const { createClient } = require("@supabase/supabase-js");
const axios = require("axios");  // Cambié a axios para obtener la imagen

// Inicialización de Express
const app = express();
app.use(bodyParser.json());

// Inicialización de OpenAI y Supabase
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Usa tu clave de OpenAI desde las variables de entorno
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

app.post("/process-image", async (req, res) => {
  const { imageUrl, app: clientApp } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "La URL de la imagen es obligatoria." });
  }

  const allowedApps = ["com.bcp.innovacxion.yapeapp", "com.bbva.pe.bbvacontigo"];
  const app = allowedApps.includes(clientApp);
  if (!app) {
    return res.status(400).json({ error: "Aplicación no permitida." });
  }

  try {
    // Usar axios para obtener la imagen
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const imageBuffer = Buffer.from(imageResponse.data, 'binary');

    // Construir el prompt específico para OpenAI
    const prompt = `
    A continuación, recibirás una imagen con información de una transferencia de dinero. Por favor, extrae y estructura los datos en formato JSON con las siguientes claves:

    - "amount": El monto de la transferencia (por ejemplo: "S/. 150.00").
    - "nombre": El nombre de la persona a quien se realizó la transferencia.
    - "email": El correo electrónico del destinatario (si está disponible).
    - "telefono": El número de teléfono del destinatario (si está disponible).
    - "medio_pago": El medio de pago utilizado (por ejemplo: "Yape", "Plin").
    - "fecha_constancia": La fecha de la transferencia (por ejemplo: "2024-10-01").
    - "numero_operacion": El código o número de operación de la transacción (por ejemplo: "123456").

    La imagen es la siguiente: ${imageUrl}
    `;

    // Usar la API de OpenAI para procesar la imagen con el prompt específico
    const openAIResponse = await openai.images.create({
      prompt: prompt,  // El prompt detallado para la extracción
      image: imageBuffer,  // La imagen en formato buffer
    });

    // Obtener el texto extraído
    const extractedText = openAIResponse.data[0].text; // Asumiendo que OpenAI devuelve el texto procesado

    if (!extractedText || extractedText === 'undefined') {
      return res.status(400).json({ error: "Texto extraído vacío o no válido." });
    }

    console.log("Texto extraído:", extractedText);

    // Procesar los datos extraídos (ejemplo con expresiones regulares)
    const extractedData = {
      amount: extractedText.match(/S\/\.\s(\d+\.\d{2})/) ? extractedText.match(/S\/\.\s(\d+\.\d{2})/)[1] : null,
      nombre: extractedText.match(/Nombre:\s([a-zA-Z\s]+)/) ? extractedText.match(/Nombre:\s([a-zA-Z\s]+)/)[1] : null,
      email: extractedText.match(/Email:\s([\w.-]+@[\w.-]+)/) ? extractedText.match(/Email:\s([\w.-]+@[\w.-]+)/)[1] : null,
      telefono: extractedText.match(/Telefono:\s(\d{9})/) ? extractedText.match(/Telefono:\s(\d{9})/)[1] : null,
      medio_pago: extractedText.match(/Medio de pago:\s([a-zA-Z\s]+)/) ? extractedText.match(/Medio de pago:\s([a-zA-Z\s]+)/)[1] : null,
      fecha_constancia: extractedText.match(/Fecha:\s([0-9]{4}-[0-9]{2}-[0-9]{2})/) ? extractedText.match(/Fecha:\s([0-9]{4}-[0-9]{2}-[0-9]{2})/)[1] : null,
      numero_operacion: extractedText.match(/N°\sde\soperación:\s(\d+)/) ? extractedText.match(/N°\sde\soperación:\s(\d+)/)[1] : null
    };

    // Insertar en Supabase
    const { data, error } = await supabase.from('acreditar').insert([extractedData]);

    if (error) {
      console.error("Error al insertar datos en Supabase:", error.message);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, data: data });

  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    res.status(500).json({ error: "Error al procesar la imagen" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
