
import { podeExecutarFuncao, STAR_REQUIREMENTS, STAR_MIN_LIMITS } from '../src/services/rules/StarSystem';
import type { Membro } from '../src/types';

// Mock Adilson EXACTLY as per DB result
const adilson: Membro = {
    id: "mock_id",
    nome_completo: "Adilson ferrari lopes",
    sexo: "HOMEM",
    nivel_experiencia: 4,
    status: "ATIVO",
    email: "",
    disponibilidade_domingo: "Livre",
    disponibilidade_quinta: "Livre",
    melhor_periodo_domingo: "Qualquer",
    aptidoes: [],
    funcoes: [], // Simulating empty functions (though StarSystem shouldn't care)
    created_at: "",
    updated_at: "",
    escalas_no_mes: 0,
    limite_mes: 2,
    ultima_escala: undefined // Added missing required property from Membro type
};

// Mock Functions
const testCases = [
    { nome: "Apoio", setor: undefined, sexo: "Unissex" },
    { nome: "Apoio", setor: "SETOR AZUL", sexo: "Unissex" },
    { nome: "Apoio - Setor Azul", setor: "SETOR AZUL", sexo: "Unissex" },
    { nome: "Lado bateria (16 máquinas)", setor: "MÁQUINAS", sexo: "Unissex" }, // Often mapped to Apoio/Maquinas
    { nome: "Responsável e apoio", setor: "SETOR AZUL", sexo: "Mulher" }, // Expect Fail
];

console.log("=== DEBUG STAR SYSTEM ===");
console.log("Checking Member:", adilson.nome_completo, `(LVL ${adilson.nivel_experiencia}, ${adilson.sexo})`);

testCases.forEach(t => {
    const result = podeExecutarFuncao(adilson, t.nome, t.sexo, t.setor);
    console.log(`Função: "${t.nome}" (Setor: ${t.setor ?? 'N/A'}, Sexo: ${t.sexo}) -> ${result ? '✅ PASS' : '❌ FAIL'}`);
});

console.log("\n=== INTERNAL LOGIC CHECK ===");
console.log("Level 4 Requirements:", STAR_REQUIREMENTS[4]);
console.log("Level 1 Requirements:", STAR_REQUIREMENTS[1]);
console.log("STAR_MIN_LIMITS['Apoio']:", STAR_MIN_LIMITS['Apoio']);
