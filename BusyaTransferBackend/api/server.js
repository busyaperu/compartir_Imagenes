const express = require("express"); 
const bodyParser = require("body-parser");
const { OpenAI } = require("openai");
const { createClient } = require("@supabase/supabase-js");

// Inicialización de Express
const app = express();
app.use(bodyParser.json());

// Inicialización de OpenAI y Supabase
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Usa la variable de entorno
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Listado de aplicaciones permitidas (ID de los bancos y billeteras)
const allowedApps = [
  { id: "com.bcp.innovacxion.yapeapp", name: "Yape" },
  { id: "com.bbva.pe.bbvacontigo", name: "BBVA" },
  { id: "com.interbank.mobilebanking", name: "Interbank" },
  { id: "pe.scotiabank.banking", name: "Scotiabank" },
  { id: "pe.bn.movil", name: "BN Movil" },
  { id: "com.banbif.mobilebanking", name: "BanBif" }
];

app.post("/process-image", async (req, res) => {
  const { imageUrl, app: clientApp, cleanedText } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: "La URL de la imagen es obligatoria." });
  }

  const app = allowedApps.find(a => a.id === clientApp);
  if (!app) {
    return res.status(400).json({ error: "Aplicación no permitida." });
  }

  // Verificar si el texto limpio está presente
  if (!cleanedText || cleanedText === 'undefined') {
    return res.status(400).json({ error: "Texto extraído vacío o no válido." });
  }

  console.log("Texto extraído (limpio):", cleanedText);

  // Usar OpenAI GPT para procesar y extraer datos
  const prompt = `
    A continuación, recibirás información de una constancia de transferencia.
    Extrae y estructura los datos en un formato JSON con las siguientes claves estándar:
    - "amount" (puede aparecer como Pago exitoso, Te Yapearon, S/. <monto>).
    - "nombre" (puede aparecer como nombre, Enviado a).
    - "email" (puede aparecer como correo, email).
    - "telefono" (puede aparecer como teléfono, celular).
    - "medio_pago" (puede aparecer como Destino).
    - "fecha_constancia" (puede aparecer como Fecha y hora).
    - "numero_operacion" (puede aparecer como Código de operación, N° de operacion).
    - "app_id" (el ID de la aplicación que hizo la transferencia).
    Texto de la constancia: ${cleanedText}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: prompt }]
    });

    const rawContent = response.choices[0].message.content.trim();
    console.log("Respuesta de OpenAI:", rawContent);

    let extractedData = JSON.parse(rawContent);

    const { amount, nombre, email, telefono, medio_pago, fecha_constancia, numero_operacion } = extractedData;

    // Validar el monto extraído
    if (!amount || amount === "N/A") {
      extractedData.amount = null; // Asigna null si el monto no está especificado
    } else {
      extractedData.amount = parseFloat(amount).toFixed(2); // Formatea el monto a dos decimales
    }

    // Validar teléfono y asignar null si no es numérico
    if (!telefono || telefono.includes("***")) {
      extractedData.telefono = null;
    }

    // Validar campos obligatorios
    if (!nombre || !medio_pago || !numero_operacion) {
      throw new Error("Faltan campos obligatorios: nombre, medio_pago o numero_operacion.");
    }

    // Validar y transformar email
    if (!email || email.toLowerCase() === "n/a") {
      extractedData.email = null; // Asigna null si el email no está especificado
    }

    // Agregar el ID de la aplicación
    extractedData.app_id = app.id;

    // Inserción en Supabase
    const { data, error } = await supabase.from('acreditar').insert([{
      amount: extractedData.amount,
      nombre: extractedData.nombre,
      email: extractedData.email,
      telefono: extractedData.telefono,
      medio_pago: extractedData.medio_pago,
      fecha_constancia: extractedData.fecha_constancia, 
      numero_operacion: extractedData.numero_operacion,
      app_id: extractedData.app_id  // Se incluye el ID de la aplicación
    }]);

    if (error) {
      console.error("Error al insertar datos en Supabase:", error.message);
      return res.status(500).json({ error: error.message });
    }

    res.json({ success: true, data: data });
  } catch (error) {
    console.error("Error al estructurar los datos con OpenAI:", error);
    res.status(500).json({ error: "Error al estructurar los datos" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
});
