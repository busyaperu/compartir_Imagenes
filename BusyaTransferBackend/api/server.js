const express = require("express");
const multer = require("multer");
const { Configuration, OpenAIApi } = require("openai");
const Tesseract = require("tesseract.js");

const app = express();

// Configurar multer para cargar imágenes
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// Inicializar OpenAI
const { OpenAIApi, Configuration } = require("openai");

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
});
const openai = new OpenAIApi(configuration);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const allowedApps = [
  "com.bcp.innovacxion.yapeapp",
  "com.bbva.pe.bbvacontigo",
  "com.interbank.mobilebanking",
  "pe.scotiabank.banking",
  "pe.bn.movil",
  "com.banbif.mobilebanking"
];

app.post("/process-image", upload.single('image'), async (req, res) => {
  const { imageUrl, app } = req.body;

  // Comprobar si la app es permitida
  if (!allowedApps.includes(app)) {
    return res.status(400).json({ error: "Aplicación no permitida." });
  }

  let imageToProcess = imageUrl || (req.file ? req.file.path : null);

  // Comprobar si hay imagen para procesar
  if (!imageToProcess) {
    return res.status(400).json({ error: "La URL de la imagen o el archivo es obligatorio." });
  }

  try {
    const { data: { text } } = await Tesseract.recognize(
      imageToProcess,
      'spa', // Ajusta según la necesidad
      { logger: m => console.log(m) }
    );

    // Usar OpenAI para estructurar los datos extraídos
    const prompt = `
    Extrae y estructura los datos de la siguiente constancia de transferencia en formato JSON. Los campos requeridos son:
    - "nombre": El nombre del receptor de la transferencia.
    - "email": El correo electrónico del receptor, si está disponible.
    - "telefono": El número de teléfono del receptor, si está disponible.
    - "fecha": Fecha y hora de la operación.
    - "medio_pago": Medio de pago utilizado.
    - "numero_operacion": Número de la transacción.
    Texto de la constancia: ${text}
    `;
    
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: prompt,
      max_tokens: 1024
    });

    const rawContent = response.data.choices[0].text.trim();
    let extractedData = JSON.parse(rawContent);
    res.json({ success: true, data: extractedData });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor iniciado en el puerto ${PORT}`));
