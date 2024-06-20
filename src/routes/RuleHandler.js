import { Rule } from 'js-rules-engine';

export class RuleHandler {
    constructor() {
        console.log("hello rule handler")

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
    }
}