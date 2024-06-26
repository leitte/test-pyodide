import { Rule } from 'js-rules-engine';
import thmo_json from './thermodynamics.json'

export class RuleHandler {
    rules = {};

    constructor() {
        console.log("hello rule handler")
        console.log(thmo_json)

        const thmoClasses = thmo_json.classes.map((thermoClass) => thermoClass.name)
        
        const eqnClasses = thmo_json.classes
          .filter((thmoClass) => thmoClass.name.endsWith('Equation') && !thmoClass.abstract)
          .map((eqnClass) => ({name: eqnClass.name, 
                               equation: eqnClass.annotations?.[0]?.value ?? undefined,
                               obj: eqnClass
                              }))
        console.log(eqnClasses)
        //console.log(thmoClasses)

        const expandRule = (rule) => {
          const expandedRule = rule.replace(/\./g, '\.value.properties\.');
          return "properties." + expandedRule + ".value"
        }
        this.rules['IdealGasLaw'] = new Rule().equals(expandRule('system.material.equation_of_state'), 'ideal gas');
          
        /*
        const rule = new Rule().equals('homeWorld.name', 'Tatooine').or((sub) => {
            sub.contains('name', 'Skywalker').equals('eyeColor', 'green');
          });

          // object of data to evaluate rule against
          const fact = {
            eyeColor: 'blue',
            homeWorld: {
              name: 'Tatooine',
            },
            name: 'Luke Skywalker',
          };
          
        console.log("rule", rule.evaluate(fact));
        console.log(JSON.stringify(rule), null, 2)
        console.log(rule)
        */
    }

    checkRules(className, objInformation) {
      if (className in this.rules) {
        console.log(objInformation)
        const matchesRules = this.rules[className].evaluate(objInformation);
        return matchesRules;
      }
      return true
    }
}