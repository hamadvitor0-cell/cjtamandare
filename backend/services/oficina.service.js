const defaultOficinas = [
  {
    nome: "Futsal",
    categoria: "Esportes",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Treinos coletivos para desenvolver técnica, trabalho em equipe e convivência."
  },
  {
    nome: "Vôlei",
    categoria: "Esportes",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Fundamentos, jogos orientados e integração por meio do esporte."
  },
  {
    nome: "Basquete",
    categoria: "Esportes",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Aulas práticas com foco em coordenação, disciplina e participação coletiva."
  },
  {
    nome: "Muay Thai",
    categoria: "Esportes",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Atividade física orientada para autocontrole, respeito e condicionamento."
  },
  {
    nome: "Judô",
    categoria: "Esportes",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Prática educativa com foco em disciplina, postura e desenvolvimento corporal."
  },
  {
    nome: "Capoeira",
    categoria: "Esportes",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Movimento, musicalidade e cultura brasileira em uma oficina inclusiva."
  },
  {
    nome: "Ginástica",
    categoria: "Dança e Movimento",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Consciência corporal, alongamento e expressão por meio do movimento."
  },
  {
    nome: "Dança Ritmos",
    categoria: "Dança e Movimento",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Aulas dinâmicas com diferentes estilos, coordenação e presença de palco."
  },
  {
    nome: "Ballet",
    categoria: "Dança e Movimento",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Base técnica, postura e expressão artística em ambiente acolhedor."
  },
  {
    nome: "Danças Urbanas",
    categoria: "Dança e Movimento",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Ritmos urbanos, criação coreográfica e protagonismo juvenil."
  },
  {
    nome: "Violão",
    categoria: "Música",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Introdução musical, acordes, repertório e prática coletiva."
  },
  {
    nome: "Canto Coral",
    categoria: "Música",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Técnica vocal, escuta, harmonia e apresentações em grupo."
  },
  {
    nome: "Bateria e Percussão",
    categoria: "Música",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Ritmo, coordenação e prática musical com instrumentos percussivos."
  },
  {
    nome: "Teclado",
    categoria: "Música",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Leitura musical inicial, harmonia e execução de repertório."
  },
  {
    nome: "Flauta Doce",
    categoria: "Música",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Prática instrumental para musicalização e desenvolvimento auditivo."
  },
  {
    nome: "Inglês",
    categoria: "Educação",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Comunicação básica, vocabulário cotidiano e apoio ao aprendizado."
  },
  {
    nome: "Informática",
    categoria: "Tecnologia",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Noções digitais, uso seguro de tecnologia e ferramentas essenciais."
  },
  {
    nome: "Xadrez",
    categoria: "Jogos",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Estratégia, concentração, raciocínio lógico e convivência."
  },
  {
    nome: "Libras",
    categoria: "Educação",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Introdução à Língua Brasileira de Sinais e comunicação inclusiva."
  },
  {
    nome: "Pintura em Tela",
    categoria: "Artes e Cultura",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Criação visual, técnicas de pintura e expressão artística."
  },
  {
    nome: "Teatro",
    categoria: "Artes e Cultura",
    faixaEtaria: "12 a 18 anos",
    diasSemana: [],
    periodo: "a definir",
    horario: "Horários definidos pela secretaria",
    descricao: "Jogos cênicos, expressão corporal, voz e criação coletiva."
  }
];

const oficinaNames = defaultOficinas.map((oficina) => oficina.nome);
const categorias = ["Todas", ...Array.from(new Set(defaultOficinas.map((oficina) => oficina.categoria)))];

function listOficinas() {
  return defaultOficinas;
}

module.exports = {
  oficinas: defaultOficinas,
  defaultOficinas,
  oficinaNames,
  categorias,
  listOficinas
};
