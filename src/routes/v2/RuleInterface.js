import * as thermoRules from './rules.json'
import { Rule } from 'js-rules-engine';

export class RuleInterface {
    RULES = {}
    RULE_VALUES = {"True": true,
                   "False": false
    }

    constructor() {
        console.log('hello rules')
        this.RULES = thermoRules.classes.reduce((acc, thermoRule) => {
            if (thermoRule.name) {
                //acc[rule.name] = rule;
                if (thermoRule.rules?.length > 0) {
                    console.log(thermoRule)
                    const slotCondition = thermoRule.rules?.[0].preconditions?.slot_conditions?.[0];
                    const ruleText = slotCondition.name;
                    let ruleValue = slotCondition.equals_expression ? this.RULE_VALUES?.[slotCondition.equals_expression] : slotCondition.equals_string;
                    console.log("rule input", ruleText, ruleValue)
                    acc[thermoRule.name] = new Rule().equals(ruleText, ruleValue)
                }
            }
            return acc;
        }, {});

        console.log(this.RULES)
    }

    ruleIsValid(rule, instance, facts) {
        //console.log('facts', facts)
        //console.log("rule requ", rule, this.RULES[rule], this.RULES[rule]?.evaluate(facts) ?? false)
        return this.RULES[rule]?.evaluate(facts) ?? false;

        if (rule in this.RULES) {
            //console.log("checking", this.RULES[rule])
            //console.log("result", this.RULES[rule].evaluate(facts))
            return this.RULES[rule].evaluate(facts)
        }
    }
}