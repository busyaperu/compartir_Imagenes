const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const Tesseract = require("tesseract.js");
const { createClient } = require("@supabase/supabase-js");

// Inicialización de Express
const app = express();
app.use(bodyParser.json());

// Inicialización de OpenAI y Supabase
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Usa la variable de entorno
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const allowedApps = [
  "com.bcp.innovacxion.yapeapp",
  "com.bbva.pe.bbvacontigo",
  "com.interbank.mobilebanking",
  "pe.scotiabank.banking",
  "pe.bn.movil",
  "com.banbif.mobilebanking"
];

app.post("/process-image", async (req, res) => {
  const { imageUrl, app: clientApp } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "La URL de la imagen es obligatoria." });
  }
  if (!allowedApps.includes(clientApp)) {
    return res.status(400).json({ error: "Aplicación no permitida." });
  }

  // Utilizando Tesseract para realizar OCR sobre la imagen
  Tesseract.recognize(
    imageUrl,
    "spa",
    { logger: (m) => console.log(m) }
  ).then(async ({ data: { text } }) => {
    console.log("Texto extraído (sin procesar):", text);

    // Limpieza del texto extraído
    const cleanedText = text
      .replace(/p E/g, "") // Elimina caracteres no deseados
      .trim();
    console.log("Texto extraído (limpio):", cleanedText);

    let extractedData = {}; // Inicializar extractedData como un objeto vacío


      // Normalizar texto y extraer monto
      const normalizedText = cleanedText.replace(/\s+/g, ' ').trim();
      const regexMonto = /s\/\s?(\d+)/i; // Busca el monto con el formato "S/ número"
      const montoMatch = normalizedText.match(regexMonto);
      if (montoMatch) {
        extractedData.amount = parseFloat(montoMatch[1]);
      } else {
        extractedData.amount = null; // Asignar null si no se encuentra el monto
      }


      // Definir meses y convertir fecha
      const months = {
        'ene': '01', 'feb': '02', 'mar': '03', 'abr': '04', 'may': '05', 'jun': '06',
        'jul': '07', 'ago': '08', 'sep': '09', 'oct': '10', 'nov': '11', 'dic': '12'
      };

      const rawFecha = normalizedText.match(/\d{1,2} \w{3}\. \d{4} - \d{1,2}:\d{2} (am|pm)/)?.[0];
      if (rawFecha) {
        const regexFecha = /(\d{1,2}) (\w{3})\. (\d{4}) - (\d{1,2}):(\d{2}) (am|pm)/;
        const match = rawFecha.match(regexFecha);
        if (match) {
          const [_, day, month, year, hours, minutes, period] = match;
          const formattedHours = period === 'pm' && hours !== '12' ? parseInt(hours) + 12 : hours.padStart(2, '0');
          extractedData.fecha = `${year}-${months[month]}-${day.padStart(2, '0')} ${formattedHours}:${minutes}:00.000000+00`;
        }
      } else {
        extractedData.fecha = null; // Asignar null si no se encuentra la fecha
      }


    // Extraer teléfono y validarlo como numérico
    const telefonoRaw = cleanedText.match(/\*\*\* \*\*\* \d+/)?.[0]?.replace(/\*\*\* \*\*\* /, "") || null;
    const telefono = telefonoRaw && /^\d+$/.test(telefonoRaw) ? telefonoRaw : null;
    extractedData.telefono = telefono;

    console.log("Texto normalizado:", normalizedText);
    console.log("Monto extraído:", extractedData.amount);
    console.log("Fecha extraída:", extractedData.fecha);
    console.log("Email extraído:", extractedData.email);


    // Usar OpenAI para estructurar los datos extraídos
    const prompt = `
      A continuación, recibirás información de una constancia de transferencia.
      Extrae y estructura los datos en un formato JSON con las siguientes claves estándar:
      - "amount" (puede aparecer como Pago exitoso, Te Yapearon, S/. <monto>).
      - "nombre" (puede aparecer como nombre, Enviado a).
      - "email" (puede aparecer como correo, email).
      - "telefono" (puede aparecer como teléfono, celular).
      - "medio_pago" (puede aparecer como Destino).
      - "fecha" (puede aparecer como Fecha y hora).
      - "numero_operacion" (puede aparecer como Código de operación, N° de operacion).
      Texto de la constancia: ${cleanedText}
    `;

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }]
      });

      const rawContent = response.choices[0].message.content.trim();
      console.log("Respuesta de OpenAI:", rawContent);

      let extractedData;
      try {
        extractedData = JSON.parse(rawContent);
        const { amount, nombre, email, telefono, medio_pago, fecha, numero_operacion } = extractedData;

      // Validar campos obligatorios y formatear valores
      if (!amount || amount === "N/A") {
        extractedData.amount = null; // Asigna null si el monto no está especificado
      } else {
        extractedData.amount = parseFloat(amount); // Convierte el monto a número
      }

      if (!telefono || telefono.includes("***") || !/^\d+$/.test(telefono)) {
        extractedData.telefono = null; // Asigna null si el teléfono no es numérico o contiene caracteres inválidos
      }

      if (!nombre || !medio_pago || !numero_operacion) {
        throw new Error("Faltan campos obligatorios: nombre, medio_pago o numero_operacion.");
      }

      // Validar email
      if (!email || email === "N/A") {
        extractedData.email = null; // Asigna null si el email no está especificado
      }

        const { data, error } = await supabase
        .from("acreditar")
        .insert([
          {
            amount: extractedData.amount,
            nombre,
            email: extractedData.email,
            telefono: extractedData.telefono,
            medio_pago,
            fecha: fecha || null,
            numero_operacion
          }
        ]);

        if (error) {
          console.error("Error al insertar datos en Supabase:", error.message);
          return res.status(500).json({ error: error.message });
        }

        res.json({ success: true, data: data });
      } catch (error) {
        console.error("Error al procesar JSON de OpenAI:", error);
        throw new Error("Respuesta de OpenAI no es un JSON válido.");
      }
    } catch (error) {
      console.error("Error al estructurar los datos con OpenAI:", error);
      res.status(500).json({ error: "Error al estructurar los datos" });
    }
  }).catch((error) => {
    console.error("Error al procesar la imagen con OCR:", error);
    res.status(500).json({ error: "Error al procesar la imagen con OCR" });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});


