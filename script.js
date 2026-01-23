document.addEventListener("DOMContentLoaded", () => {

  /* =========================
     SUPABASE CONFIG
  ========================= */
  const SUPABASE_URL = "https://rmylubijetneztskpaud.supabase.co";
  const SUPABASE_KEY = "sb_publishable_k3Tkbfch2OQ78VfeU8NNdA_30vP0WEX";

  const supabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
  );

  const AUTO_REFRESH = 5000;
  const FILA = [];
  let processando = false;
  let dadosBrutos = {};

  /* =========================
     ELEMENTOS
  ========================= */
  const input = document.getElementById("input");
  const acompanhamento = document.getElementById("acompanhamento");

  const cntEntrada = document.getElementById("countEntrada");
  const cntSaida = document.getElementById("countSaida");

  const filtroStatus = document.getElementById("filtroStatus");
  const filtroData = document.getElementById("filtroData");
  const btnDownload = document.getElementById("btnDownload");
  const msg = document.getElementById("mensagem");

  /* =========================
     STATUS (FONTE ÚNICA)
  ========================= */
  function calcularStatus(d) {
    if (d.entrada && d.saida) return "OK";
    if (d.entrada && !d.saida) return "Falta Saída";
    if (!d.entrada && d.saida) return "Falta Entrada";
    return "Sem Movimentação";
  }

  /* =========================
     MENSAGEM
  ========================= */
  function mostrarMensagem(texto, tipo = "aviso", tempo = 1200) {
    if (!msg) return;
    msg.className = `mensagem ${tipo}`;
    msg.innerText = texto;
    msg.style.display = "block";
    setTimeout(() => (msg.style.display = "none"), tempo);
  }

  /* =========================
     FILTROS + CONTADORES
  ========================= */
  function aplicarFiltros(dados) {
    const statusSelecionado = filtroStatus?.value || "todos";
    const dataSelecionada = filtroData?.value || "";

    let filtrado = {};
    let entrada = 0;
    let saida = 0;

    Object.keys(dados).forEach(codigo => {
      const d = dados[codigo];
      const status = calcularStatus(d);

      // filtro status
      if (statusSelecionado !== "todos" && status !== statusSelecionado) return;

      // filtro data
      if (dataSelecionada) {
        const dataRef =
          ETAPA === "entrada" ? d.data_entrada :
          ETAPA === "saida" ? d.data_saida :
          null;

        if (!dataRef) return;

        const dataISO = new Date(dataRef).toISOString().slice(0, 10);
        if (dataISO !== dataSelecionada) return;
      }

      filtrado[codigo] = d;

      if (d.entrada) entrada++;
      if (d.saida) saida++;
    });

    // contadores reativos aos filtros
    if (cntEntrada) cntEntrada.innerText = entrada;
    if (cntSaida) cntSaida.innerText = saida;

    return filtrado;
  }

  /* =========================
     RENDER
  ========================= */
  function render(dados) {
    let html = `
      <table>
        <thead>
          <tr>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Data (Entrada)</th>
            <th>Data (Saída)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
    `;

    Object.keys(dados).sort().forEach(codigo => {
      const d = dados[codigo];
      const status = calcularStatus(d);

      html += `
        <tr>
          <td>${d.entrada ? codigo : ""}</td>
          <td>${d.saida ? codigo : ""}</td>
          <td>${d.data_entrada ? new Date(d.data_entrada).toLocaleString("pt-BR") : ""}</td>
          <td>${d.data_saida ? new Date(d.data_saida).toLocaleString("pt-BR") : ""}</td>
          <td class="${status === "OK" ? "ok" : "erro"}">${status}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    acompanhamento.innerHTML = html;
  }

  /* =========================
     SINCRONIZAR
  ========================= */
  async function sincronizar() {
    try {
      const { data, error } = await supabase
        .from("controle_galpao")
        .select("*")
        .order("id", { ascending: false });

      if (error) throw error;

      dadosBrutos = {};
      data.forEach(r => {
        dadosBrutos[r.codigo] = r;
      });

      render(aplicarFiltros(dadosBrutos));
    } catch (e) {
      console.error("Erro ao sincronizar:", e);
    }
  }

  /* =========================
     REGISTRAR MOVIMENTAÇÃO
  ========================= */
  async function registrarMovimentacao(codigo) {
    const payload =
      ETAPA === "entrada"
        ? { codigo, entrada: true, data_entrada: new Date() }
        : { codigo, saida: true, data_saida: new Date() };

    const { error } = await supabase
      .from("controle_galpao")
      .upsert(payload, { onConflict: "codigo" });

    if (error) throw error;
  }

  /* =========================
     INPUT → FILA
  ========================= */
  input.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const codigo = input.value.trim();
    input.value = "";
    input.focus();

    if (!codigo) return;

    FILA.push(codigo);
    processarFila();
  });

  async function processarFila() {
    if (processando || FILA.length === 0) return;
    processando = true;

    try {
      await registrarMovimentacao(FILA.shift());
      mostrarMensagem("Registrado com sucesso", "sucesso");
      await sincronizar();
    } catch (e) {
      mostrarMensagem("Erro ao registrar", "erro");
      console.error(e);
    } finally {
      processando = false;
      processarFila();
    }
  }

  /* =========================
     EVENTOS FILTROS
  ========================= */
  filtroStatus?.addEventListener("change", () => {
    render(aplicarFiltros(dadosBrutos));
  });

  filtroData?.addEventListener("change", () => {
    render(aplicarFiltros(dadosBrutos));
  });

  /* =========================
     DOWNLOAD CSV
  ========================= */
  btnDownload?.addEventListener("click", () => {
    let csv = "Codigo;Entrada;Saída;Data Entrada;Data Saída;Status\n";

    Object.keys(dadosBrutos).forEach(codigo => {
      const d = dadosBrutos[codigo];
      csv += `${codigo};${d.entrada};${d.saida};${d.data_entrada || ""};${d.data_saida || ""};${calcularStatus(d)}\n`;
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `controle_${ETAPA}.csv`;
    a.click();
  });

  /* =========================
     INIT
  ========================= */
  sincronizar();
  setInterval(sincronizar, AUTO_REFRESH);
  input.focus();

});
