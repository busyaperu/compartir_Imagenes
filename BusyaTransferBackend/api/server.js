const express = require("express");
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");

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
    URL de la constancia: ${imageUrl}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }]
    });

    console.log("Respuesta cruda de OpenAI:", response);

    if (response.choices[0].message.content.includes("{")) { // Verifica si parece un JSON
      const rawContent = response.choices[0].message.content.trim();
      try {
        const extractedData = JSON.parse(rawContent);
        res.json({ success: true, data: extractedData });
      } catch (error) {
        throw new Error("No se pudo interpretar la respuesta como un JSON.");
      }
    } else {
      throw new Error("La respuesta de OpenAI no contiene un JSON estructurado.");
    }
  } catch (error) {
    console.error("Error al procesar la imagen:", error);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});


