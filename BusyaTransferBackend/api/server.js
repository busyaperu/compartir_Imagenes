const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const Tesseract = require("tesseract.js");
const { createClient } = require("@supabase/supabase-js");

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("SUPABASE_KEY:", process.env.SUPABASE_KEY);
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const app = express();
app.use(bodyParser.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Usa la variable de entorno
});

const allowedApps = [
  "com.bcp.innovacxion.yapeapp",
  "com.bbva.pe.bbvacontigo",
  "com.interbank.mobilebanking",
  "pe.scotiabank.banking",
  "pe.bn.movil",
  "com.banbif.mobilebanking"
];

app.post("/process-image", async (req, res) => {
  const { imageUrl, app } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "La URL de la imagen es obligatoria." });
  }
  if (!allowedApps.includes(app)) {
    return res.status(400).json({ error: "Aplicación no permitida." });
  }

  // Utilizando Tesseract para realizar OCR sobre la imagen
  Tesseract.recognize(
    imageUrl,
    'spa', // Asumiendo español, ajusta según necesidad
    { logger: m => console.log(m) }
  ).then(async ({ data: { text } }) => {
    console.log("Texto extraído:", text);

    // Usar OpenAI para estructurar los datos extraídos
    const prompt = `
      A continuación, recibirás información de una constancia de transferencia.
      Extrae y estructura los datos en un formato JSON con las siguientes claves estándar:
      - "amount" (puede aparecer como Pago exitoso, Te Yapearon).
      - "nombre" (puede aparecer como nombre, Enviado a).
      - "email" (puede aparecer como correo, email).
      - "telefono" (puede aparecer como teléfono, celular).
      - "medio_pago" (puede aparecer como Destino).
      - "fecha" (puede aparecer como Fecha y hora).
      - "numero_operacion" (puede aparecer como Código de operación, N° de operacion).
      Texto de la constancia: ${text}
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }]
      });

      const rawContent = response.choices[0].message.content.trim();
      let extractedData;
      try {
        extractedData = JSON.parse(rawContent);
        const { amount, nombre, email, telefono, medio_pago, fecha, numero_operacion } = extractedData;

        if (!amount || !nombre || !medio_pago || !numero_operacion) {
          throw new Error("Faltan campos obligatorios: amount, nombre, medio_pago o numero_operacion.");
        }
        if (!email && !telefono) {
          throw new Error("Debe incluirse al menos uno: email o teléfono.");
        }

        // Inserción en Supabase
        const { data, error } = await supabase
          .from('acreditar')
          .insert([
            {
              amount: amount === "N/A" ? null : amount,
              nombre: nombre,
              email: email === "N/A" ? null : email,
              telefono: telefono,
              medio_pago: medio_pago,
              fecha: fecha,
              numero_operacion: numero_operacion
            }
          ]);

        if (error) {
          console.error("Error al insertar datos en Supabase:", error.message);
          return res.status(500).json({ error: error.message });
        }

        res.json({ success: true, data: data });
      } catch (error) {
        throw new Error("Respuesta de OpenAI no es un JSON válido.");
      }
    } catch (error) {
      console.error("Error al estructurar los datos con OpenAI:", error);
      res.status(500).json({ error: "Error al estructurar los datos" });
    }
  }).catch(error => {
    console.error("Error al procesar la imagen con OCR:", error);
    res.status(500).json({ error: "Error al procesar la imagen con OCR" });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});




