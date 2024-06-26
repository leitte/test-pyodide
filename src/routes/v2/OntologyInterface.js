import * as $rdf from 'rdflib';
import { RuleInterface } from './RuleInterface';

export class OntologyInterface {

    constructor(ontologyTTL, url) {
        this.g = $rdf.graph();
        const mimeType = 'text/turtle'
        try {
            $rdf.parse(ontologyTTL, this.g, url, mimeType)
            console.log("namespace",this.g.namespaces)
            Object.entries(this.g.namespaces).forEach(([key,value]) => {
                this[key.toUpperCase()] = $rdf.Namespace(value);
            });
            
            this.knownClasses = this.getKnownClasses();
            this.knownInstances = {};
            this.ruleInterface = new RuleInterface();

            console.log("classes", this.knownClasses.size)
            //this['SCHEMA'] = $rdf.Namespace('http://schema.org/')

            //this.attributes('Transition');
        } catch (err) {
            console.log(err)
        }
    }

    static async createInstance(url) {
        //const data = await fetch(url);
        //const ontologyTTL = await data.text();
        const ontologyTTL = ontologyText;
        return new OntologyInterface(ontologyTTL, url);
    }    

    get size() {
        return this.countTriples();
    }

    countTriples() {
        return this.g.match(null,null,null).length;
    }

    extractClassName(uri) {
        // Split the URI by # and /, and take the last segment
        const segments = uri.split(/[#/]/);
        return segments[segments.length - 1];
    }

    getKnownClasses() {
        const classObjects = this.g.each(null,this.RDF('type'),this.OWL('Class'));

        return new Set(classObjects.map((classObject) => this.extractClassName(classObject.value)));

    }

    getAncestors(className, returnURI=true) {
        const node = className instanceof $rdf.Node ? className : this.THERMO(className);
        const superClasses = returnURI ? new Set() : [];

        const find = (node) => {
            const sc = this.g.each(node, this.RDFS('subClassOf'), null);
            sc.forEach((s) => {
                if (s.termType === 'NamedNode') {
                    if (returnURI) {
                        superClasses.add(s.uri)
                    } else {
                        if (superClasses.every(obj => obj.uri !== s.uri)) {
                            superClasses.push(s)
                        }
                    }
                    find(s)
                }
            })
        }
        find(node)
        return Array.from(superClasses)
    }

    getDescendents(className) {
        const node = className instanceof $rdf.Node ? className : this.THERMO(className);
        const namedSubClasses = new Set();

        const find = (node) => {
            const subClasses = this.g.each(null, this.RDFS('subClassOf'), node);
            subClasses.forEach((subClass) => {
                if (subClass.termType === 'NamedNode') {
                    namedSubClasses.add(subClass)
                    find(subClass)
                }
            })
        }
        find(node)
        return Array.from(namedSubClasses)
    }

    print(node) {
        const data = this.g.statementsMatching(node, null, null);

        data.forEach((statement) => {
            console.log(statement.predicate)
        })
    }

    getProperties(className) {
        const node = className instanceof $rdf.Node ? className : this.THERMO(className);
        const properties = {};

        const isRestriction = (node) => this.g.holds(node, this.RDF('type'), this.OWL('Restriction'));
        const getPropertyOfRestriction = (node) => this.g.any(node, this.OWL('onProperty'), null) ?? undefined;
        const getRange = (node) => this.g.any(node, this.RDFS('range'), null) ?? 
                                   this.g.any(node, this.OWL('allValuesFrom'), null) ??
                                   this.XSD('string');

        const find = (node) => {
            const superClasses = this.g.each(node, this.RDFS('subClassOf'), null);
            superClasses.forEach((superClass) => {
                if (isRestriction(superClass)) {
                    const restriction = superClass;
                    const property = getPropertyOfRestriction(restriction);
                    const propertyName = property?.value ? this.extractClassName(property?.value) : undefined;
                    //const minCard = this.g.any(restriction, this.OWL('minCardinality', null));
                    //const maxCard = this.g.any(restriction, this.OWL('maxCardinality', null));
                    if (property && !(propertyName in properties)) {
                        const range = getRange(property);
                        properties[propertyName] = range; //?.value ?? undefined;
                    }
                }
            })
        }
        find(node)
        this.getAncestors(className).forEach((ancestor) => {
             find($rdf.sym(ancestor))
        })
        return properties
    }

    hasSlotWithRange(node, rangeNode) {
        const nodeProperties = this.getProperties(node);
        console.log(node.value, Object.values(nodeProperties).includes(rangeNode.uri))
        return Object.values(nodeProperties).includes(rangeNode.uri)
    }

    getRules(concept) {
        const isRule = (node) => this.g.holds(node, this.RDFS('subClassOf'), this.THERMO('Rule'))
        const ancestors = this.getAncestors(concept, false);
        //console.log('ancestors', concept.uri, ancestors)
        //const rules = ancestors.filter((ancestor) => this.isRule(ancestor))
        const rules = ancestors.filter((ancestor) => isRule(ancestor))
        console.log("rules", this.extractClassName(concept.uri), rules)
        return rules
    }

    equationIsApplicable(equation, instance) {
        const rules = this.getRules(equation)
        const materialName = this.knownInstances[instance.system].material
        const facts = {"system": this.knownInstances[instance.system],
                       "material": this.knownInstances[materialName]
        }
        console.log('facts', facts)
        return rules.every(rule => this.ruleInterface?.ruleIsValid(this.extractClassName(rule.uri), instance, facts));
    }

    getEquations(equationClassName, instance) {
        const equationNodes = this.getDescendents(this.THERMO(equationClassName));
        //const equations = equationNodes.filter((equationNode) => this.hasSlotWithRange(equationNode, node))
        console.log(equationNodes.map((n) => n.uri))
        console.log(`checking ${equationClassName}s for type `, instance['@type'], instance.id)
        console.log("instance", instance)


        const validEquations = equationNodes.filter((equation) => this.equationIsApplicable(equation, instance))
        console.log(validEquations)
        return equationNodes
    }

    registerInstance(instance) {
        if ('id' in instance) {
            this.knownInstances[instance.id] = instance;
        } else {
            // TODO: instance has no id; throw error
            console.log("#### instance without id detected", instance)
        }
        
    }

    setValues(classInstance, data) {
        const isArrayOfStrings = (obj) => Array.isArray(obj) && obj.every(item => typeof item === 'string');
        const isArrayOfObjects = (obj) => Array.isArray(obj) && obj.every(item => typeof item === 'object' && item !== null && !Array.isArray(item));

        if (data) {
            Object.entries(data).forEach(([slot,slotData]) => {
                console.log(slot,slotData)
                if (slot in classInstance) {
                    if (typeof slotData === 'string' ||
                        typeof slotData === 'number' ||
                        typeof slotData === 'boolean' ||
                        isArrayOfStrings(slotData)) {
                        classInstance[slot] = slotData;
                    } 
                    else if (isArrayOfObjects(slotData)) {
                        const rangeClassName = this.extractClassName(classInstance[slot].uri);
                        classInstance[slot] = [];
                        slotData.forEach((objData) => {
                            const targetObject = this.createClassObject(rangeClassName, objData);
                            this.registerInstance(targetObject);
                            classInstance[slot].push(targetObject.id)
                        })
                    }
                    else if (typeof slotData === 'object') {
                        const rangeIsVariable = this.getAncestors(classInstance[slot]).includes(this.THERMO('Variable').uri);
                        //console.log("#### is variable", slot, this.getAncestors(classInstance[slot]), rangeIsVariable)
                        const rangeClassName = this.extractClassName(classInstance[slot].uri);
                        if (rangeIsVariable && !('id' in slotData) && 'index' in data) {
                            slotData['id'] = slot + `_${data['index']}`
                        }
                        const instance = this.createClassObject(rangeClassName, slotData);
                        this.registerInstance(instance);
                        classInstance[slot] = instance.id;
                    }
                    else {

                    }
                }
            })
        }
    }

    createClassObject(className, data=undefined) {
        if (this.knownClasses?.has(className)) {
            //console.log('got class', className)

            const properties = this.getProperties(className)
            this.setValues(properties, data)
            //console.log(properties)
            properties['@type'] = className;
            return properties;
        } else {
            console.log("cannot find class", className)
            return {}
        }
    }
}




const ontologyText = `
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix linkml: <https://w3id.org/linkml/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix pav: <http://purl.org/pav/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema1: <http://schema.org/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix thermo: <https://example.org/thermodynamics/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

thermo:AmountOfSubstanceEquation a owl:Class ;
    rdfs:label "AmountOfSubstanceEquation" ;
    schema1:mathExpression "n = m/M_i" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Mass ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarMass ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:AmountOfSubstance ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:n ],
        thermo:SystemEquation ;
    skos:inScheme thermo:essentialEquations ;
    thermo:codeExpression "m_{system} = M_{system#material}*n_{system}" .

thermo:ClosedSystem a owl:Class ;
    rdfs:label "ClosedSystem" ;
    rdfs:subClassOf thermo:System ;
    skos:altLabel "closed system",
        "control mass" ;
    skos:inScheme thermo:concepts .

thermo:DelCEquation a owl:Class ;
    rdfs:label "DelCEquation" ;
    schema1:mathExpression "del_c = c_1 - c_2" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_c_{change_of_state#transition} = c_{change_of_state#final_state} - c_{change_of_state#initial_state}" .

thermo:DelEKinEquation a owl:Class ;
    rdfs:label "DelEKinEquation" ;
    schema1:mathExpression "del_E_kin = E_kin_1 - E_kin_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_E_kin_{change_of_state#transition} = E_kin_{change_of_state#final_state} - E_kin_{change_of_state#initial_state}" .

thermo:DelEPotEquation a owl:Class ;
    rdfs:label "DelEPotEquation" ;
    schema1:mathExpression "del_E_pot = E_pot_1 - E_pot_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_E_pot_{change_of_state#transition} = E_pot_{change_of_state#final_state} - E_pot_{change_of_state#initial_state}" .

thermo:DelHEquation a owl:Class ;
    rdfs:label "DelHEquation" ;
    schema1:mathExpression "del_H = H_1 - H_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_H_{change_of_state#transition} = H_{change_of_state#final_state} - H_{change_of_state#initial_state}" .

thermo:DelPEquation a owl:Class ;
    rdfs:label "DelPEquation" ;
    schema1:mathExpression "del_p = p_1 - p_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_p_{change_of_state#transition} = p_{change_of_state#final_state} - p_{change_of_state#initial_state}" .

thermo:DelSEquation a owl:Class ;
    rdfs:label "DelSEquation" ;
    schema1:mathExpression "del_S = S_1 - S_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_S_{change_of_state#transition} = S_{change_of_state#final_state} - S_{change_of_state#initial_state}" .

thermo:DelTEquation a owl:Class ;
    rdfs:label "DelTEquation" ;
    schema1:mathExpression "del_T = T_1 - T_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_T_{change_of_state#transition} = T_{change_of_state#final_state} - T_{change_of_state#initial_state}" .

thermo:DelUEquation a owl:Class ;
    rdfs:label "DelUEquation" ;
    schema1:mathExpression "del_U = U_1 - U_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_U_{change_of_state#transition} = U_{change_of_state#final_state} - U_{change_of_state#initial_state}" .

thermo:DelVEquation a owl:Class ;
    rdfs:label "DelVEquation" ;
    schema1:mathExpression "del_V = V_1 - V_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_V_{change_of_state#transition} = V_{change_of_state#final_state} - V_{change_of_state#initial_state}" .

thermo:DelZEquation a owl:Class ;
    rdfs:label "DelZEquation" ;
    schema1:mathExpression "del_z = z_1 - z_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_z_{change_of_state#transition} = z_{change_of_state#final_state} - z_{change_of_state#initial_state}" .

thermo:DeleKinEquation a owl:Class ;
    rdfs:label "DeleKinEquation" ;
    schema1:mathExpression "del_e_kin = e_kin_1 - e_kin_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_e_kin_{change_of_state#transition} = e_kin_{change_of_state#final_state} - e_kin_{change_of_state#initial_state}" .

thermo:DelePotEquation a owl:Class ;
    rdfs:label "DelePotEquation" ;
    schema1:mathExpression "del_e_pot = e_pot_1 - e_pot_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_e_pot_{change_of_state#transition} = e_pot_{change_of_state#final_state} - e_pot_{change_of_state#initial_state}" .

thermo:DelhEquation a owl:Class ;
    rdfs:label "DelhEquation" ;
    schema1:mathExpression "del_h = h_0 - h_1" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_h_{change_of_state#transition} = h_{change_of_state#final_state} - h_{change_of_state#initial_state}" .

thermo:DelsEquation a owl:Class ;
    rdfs:label "DelsEquation" ;
    schema1:mathExpression "del_s = s_1 - s_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_s_{change_of_state#transition} = s_{change_of_state#final_state} - s_{change_of_state#initial_state}" .

thermo:DeluEquation a owl:Class ;
    rdfs:label "DeluEquation" ;
    schema1:mathExpression "del_u = u_1 - u_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_u_{change_of_state#transition} = u_{change_of_state#final_state} - u_{change_of_state#initial_state}" .

thermo:DelvEquation a owl:Class ;
    rdfs:label "DelvEquation" ;
    schema1:mathExpression "del_v = v_1 - v_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_v_{change_of_state#transition} = v_{change_of_state#final_state} - v_{change_of_state#initial_state}" .

thermo:DensityEquation a owl:Class ;
    rdfs:label "DensityEquation" ;
    schema1:mathExpression "rho = m/V" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "rho_{state} = m_{system}/V_{state}" .

thermo:FirstLaw a owl:Class ;
    rdfs:label "FirstLaw" ;
    schema1:mathExpression "Q + W = del_U + del_E_kin + del_E_pot" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:Heat ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Work ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:KineticEnergyCenterMassDifference ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PotentialEnergyCenterMassDifference ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalEnergyDifference ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_E_pot ],
        thermo:ChangeOfStateEquation ;
    skos:inScheme thermo:essentialEquations ;
    thermo:codeExpression "Q_{change_of_state} + W_{change_of_state} = del_U_{change_of_state} + del_E_kin_{change_of_state} + del_E_pot_{change_of_state}" .

thermo:IdealGasLaw a owl:Class ;
    rdfs:label "IdealGasLaw" ;
    schema1:mathExpression "p * V = m * R * T" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:Volume ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Temperature ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:IndividualGasConstant ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Mass ;
            owl:onProperty thermo:m ],
        thermo:IdealGasEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:idealGasEquations ;
    thermo:codeExpression "p_{state} * V_{state} = m_{system} * R_{system.material} * T_{state}" .

thermo:IdealGasLawAmountOfSubstance a owl:Class ;
    rdfs:label "IdealGasLawAmountOfSubstance" ;
    schema1:mathExpression "p * V = n * Rbar * T" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:AmountOfSubstance ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:UniversalGasConstant ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Volume ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Temperature ;
            owl:onProperty thermo:T ],
        thermo:DerivedEquation,
        thermo:IdealGasEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:idealGasEquations ;
    thermo:codeExpression "p_{state} * V_{state} = n_{system} * Rbar_{system#material} * T_{state}" .

thermo:Mixture a owl:Class ;
    rdfs:label "Mixture" ;
    rdfs:subClassOf thermo:Material ;
    skos:altLabel "mixture of materials",
        "substance mixture" ;
    skos:definition "A mixture consist of multiple (pure) substances." ;
    skos:inScheme thermo:concepts .

thermo:OpenSystem a owl:Class ;
    rdfs:label "OpenSystem" ;
    rdfs:subClassOf thermo:System ;
    skos:altLabel "control volume",
        "open system" ;
    skos:definition "An open system is a fixed part of the space that we are interested in.  Work and heat as well as matter can be transferred across its boundary. " ;
    skos:inScheme thermo:concepts .

thermo:PolytropicIndexEquation a owl:Class ;
    rdfs:label "PolytropicIndexEquation" ;
    schema1:mathExpression "polytropic_index = ln(p_0/p_1)/ln(v_0/v_1)" ;
    rdfs:subClassOf thermo:ChangeOfStateEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "polytropic_index_{change_of_state#transition} = ln(p_{change_of_state#initial_state} / p_{change_of_state#final_state})/ln(v_{change_of_state#final_state} / v_{change_of_state#initial_state})" .

thermo:SecondLaw a owl:Class ;
    rdfs:label "SecondLaw" ;
    schema1:mathExpression "del_s > 0" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEntropyDifference ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ChangeOfState ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_s ],
        thermo:AdiabaticRule,
        thermo:Inequality,
        thermo:IrreversibleRule ;
    skos:inScheme thermo:essentialEquations ;
    thermo:codeExpression "del_s_{change_of_state} > 0" .

thermo:SpecificEnthalpyEquation a owl:Class ;
    rdfs:label "SpecificEnthalpyEquation" ;
    schema1:mathExpression "h = u + p*v" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificVolume ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEnthalpy ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificInternalEnergy ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:v ],
        thermo:StateEquation ;
    skos:inScheme thermo:essentialEquations ;
    thermo:codeExpression "h_{state} = u_{state} + p_{state}*v_{state}" .

thermo:SpecificIdealGasLaw a owl:Class ;
    rdfs:label "SpecificIdealGasLaw" ;
    schema1:mathExpression "p * v = R * T" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificVolume ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:IndividualGasConstant ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Temperature ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:R ],
        thermo:DerivedEquation,
        thermo:IdealGasEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:idealGasEquations ;
    thermo:codeExpression "p_{state} * v_{state} = R_{system#material} * T_{state}" .

thermo:SpecificKineticEnergyCenterMassEquation a owl:Class ;
    rdfs:label "SpecificKineticEnergyCenterMassEquation" ;
    schema1:mathExpression "e_kin = E_kin/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "e_kin_{state} = E_kin_{state}/m_{system}" .

thermo:SpecificPotentialEnergyCenterMassEquation a owl:Class ;
    rdfs:label "SpecificPotentialEnergyCenterMassEquation" ;
    schema1:mathExpression "e_pot = E_pot/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "e_pot_{state} = E_pot_{state}/m_{system}" .

thermo:SpecificStateVariableHEquation a owl:Class ;
    rdfs:label "SpecificStateVariableHEquation" ;
    schema1:mathExpression "h = H/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "h_{state} = H_{state}/m_{system}" .

thermo:SpecificStateVariableSEquation a owl:Class ;
    rdfs:label "SpecificStateVariableSEquation" ;
    schema1:mathExpression "s = S/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "s_{state} = S_{state}/m_{system}" .

thermo:SpecificStateVariableUEquation a owl:Class ;
    rdfs:label "SpecificStateVariableUEquation" ;
    schema1:mathExpression "u = U/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "u_{state} = U_{state}/m_{system}" .

thermo:SpecificStateVariableVEquation a owl:Class ;
    rdfs:label "SpecificStateVariableVEquation" ;
    schema1:mathExpression "v = V/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "v_{state} = V_{state}/m_{system}" .

thermo:StandardPressure a owl:Class ;
    rdfs:label "StandardPressure" ;
    schema1:Unit "Pa" ;
    schema1:mathExpression "p_0" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        thermo:UniversalQuantity,
        thermo:Variable ;
    skos:altLabel "standard pressure" ;
    skos:inScheme thermo:variables .

thermo:T_const a owl:DatatypeProperty ;
    rdfs:label "T_const" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:ThermalDensityEquation a owl:Class ;
    rdfs:label "ThermalDensityEquation" ;
    schema1:mathExpression "rho = 1/v" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:StateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "rho_{state} = 1/v_{state}" .

thermo:is_isenthalpic a owl:DatatypeProperty ;
    rdfs:label "is_isenthalpic" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_isentropic a owl:DatatypeProperty ;
    rdfs:label "is_isentropic" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_isobaric a owl:DatatypeProperty ;
    rdfs:label "is_isobaric" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_isochoric a owl:DatatypeProperty ;
    rdfs:label "is_isochoric" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_isothermal a owl:DatatypeProperty ;
    rdfs:label "is_isothermal" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_polytropic a owl:DatatypeProperty ;
    rdfs:label "is_polytropic" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:Inequality a owl:Class ;
    rdfs:label "Inequality" ;
    rdfs:subClassOf thermo:MathematicalFormula ;
    skos:inScheme thermo:equations .

thermo:IsentropicRule a owl:Class ;
    rdfs:label "IsentropicRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:IsobaricRule a owl:Class ;
    rdfs:label "IsobaricRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:IsochoricRule a owl:Class ;
    rdfs:label "IsochoricRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:IsothermalRule a owl:Class ;
    rdfs:label "IsothermalRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:NotInMotionRule a owl:Class ;
    rdfs:label "NotInMotionRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:PolytropicRule a owl:Class ;
    rdfs:label "PolytropicRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:Ratio a owl:Class ;
    rdfs:label "Ratio" ;
    rdfs:subClassOf thermo:DerivedVariable ;
    skos:altLabel "ratio" ;
    skos:inScheme thermo:derivedVariables .

thermo:SystemEquation a owl:Class ;
    rdfs:label "SystemEquation" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:System ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:system ],
        thermo:ClosedSystemRule,
        thermo:Equation,
        thermo:HomogeneousSystemRule,
        thermo:SystemInEquilibriumRule ;
    skos:inScheme thermo:equations .

thermo:AdiabaticRule a owl:Class ;
    rdfs:label "AdiabaticRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:DerivedEquation a owl:Class ;
    rdfs:label "DerivedEquation" ;
    skos:inScheme thermo:idealGasEquations .

thermo:DerivedVariable a owl:Class ;
    rdfs:label "DerivedVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "derived variable" ;
    skos:definition "A variable which can be mathematically derived." ;
    skos:inScheme thermo:derivedVariables .

thermo:ElectricalWork a owl:Class ;
    rdfs:label "ElectricalWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_electrical" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:ElectricalWorkPerMass a owl:Class ;
    rdfs:label "ElectricalWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_electrical" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:Element a owl:Class ;
    rdfs:label "Element" ;
    skos:inScheme thermo:variables .

thermo:Enthalpy a owl:Class ;
    rdfs:label "Enthalpy" ;
    schema1:Unit "J" ;
    schema1:mathExpression "H" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "enthalpy" ;
    skos:inScheme thermo:variables .

thermo:EnthalpyDifference a owl:Class ;
    rdfs:label "EnthalpyDifference" ;
    schema1:Unit "J" ;
    schema1:mathExpression "del_H" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:Entropy a owl:Class ;
    rdfs:label "Entropy" ;
    schema1:Unit "J/K" ;
    schema1:mathExpression "S" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "entropy" ;
    skos:inScheme thermo:variables .

thermo:EntropyDifference a owl:Class ;
    rdfs:label "EntropyDifference" ;
    schema1:Unit "J/K" ;
    schema1:mathExpression "del_S" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:EquationOfState a owl:Class ;
    rdfs:label "EquationOfState" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:EquationOfStateModels ;
            owl:onProperty thermo:model ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:model ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:model ],
        thermo:Concept ;
    skos:altLabel "equation of state" ;
    skos:definition "An EoS is the relation between functions of state, such as temperature (T), pressure (P), volume (V), internal energy or specific heat.  It characterizes the state of matter of a material under a given set of physical conditions.  (https://serc.carleton.edu/NAGTWorkshops/mineralogy/mineral_physics/eos.html)" ;
    skos:inScheme thermo:concepts .

<https://example.org/thermodynamics/EquationOfStateModels#ideal+gas> a owl:Class ;
    rdfs:label "ideal gas" ;
    rdfs:subClassOf thermo:EquationOfStateModels .

<https://example.org/thermodynamics/EquationOfStateModels#van+der+Waals> a owl:Class ;
    rdfs:label "van der Waals" ;
    rdfs:subClassOf thermo:EquationOfStateModels .

thermo:ExternalWork a owl:Class ;
    rdfs:label "ExternalWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_a" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:value ],
        thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:ExternalWorkPerMass a owl:Class ;
    rdfs:label "ExternalWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_a" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:HeatCapacityRatio a owl:Class ;
    rdfs:label "HeatCapacityRatio" ;
    schema1:Unit "None" ;
    schema1:mathExpression "kappa" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Ratio,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:HeatPerMass a owl:Class ;
    rdfs:label "HeatPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "q" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:IdealGasRule a owl:Class ;
    rdfs:label "IdealGasRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:InternalEnergy a owl:Class ;
    rdfs:label "InternalEnergy" ;
    schema1:Unit "J" ;
    schema1:mathExpression "U" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "internal energy" ;
    skos:inScheme thermo:variables .

thermo:InternalWork a owl:Class ;
    rdfs:label "InternalWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_i" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:InternalWorkPerMass a owl:Class ;
    rdfs:label "InternalWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_i" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:IrreversibleRule a owl:Class ;
    rdfs:label "IrreversibleRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:KineticEnergyCenterMass a owl:Class ;
    rdfs:label "KineticEnergyCenterMass" ;
    schema1:Unit "J" ;
    schema1:mathExpression "E_kin" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "kinetic energy",
        "kinetic energy center mass" ;
    skos:inScheme thermo:variables .

thermo:Material a owl:Class ;
    rdfs:label "Material" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:homogeneous ],
        thermo:Concept ;
    skos:altLabel "material" ;
    skos:inScheme thermo:concepts .

thermo:MathematicalFormula a owl:Class ;
    rdfs:label "MathematicalFormula" ;
    skos:inScheme thermo:equations .

thermo:MolarHeatCapacityConstantPressure a owl:Class ;
    rdfs:label "MolarHeatCapacityConstantPressure" ;
    schema1:Unit "J/(K mol)" ;
    schema1:mathExpression "c_pm" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:MaterialProperty,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:MolarHeatCapacityConstantVolume a owl:Class ;
    rdfs:label "MolarHeatCapacityConstantVolume" ;
    schema1:Unit "J/(K mol)" ;
    schema1:mathExpression "c_vm" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:MaterialProperty,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:PolytropicIndex a owl:Class ;
    rdfs:label "PolytropicIndex" ;
    schema1:Unit "none" ;
    schema1:mathExpression "polytropic_index" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:PositionCenterMass a owl:Class ;
    rdfs:label "PositionCenterMass" ;
    schema1:Unit "none" ;
    schema1:mathExpression "z" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "position of center of mass" ;
    skos:inScheme thermo:variables .

thermo:PositionCenterMassDifference a owl:Class ;
    rdfs:label "PositionCenterMassDifference" ;
    schema1:Unit "none" ;
    schema1:mathExpression "del_z" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:PotentialEnergyCenterMass a owl:Class ;
    rdfs:label "PotentialEnergyCenterMass" ;
    schema1:Unit "J" ;
    schema1:mathExpression "E_pot" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "potential energy",
        "potential energy center mass" ;
    skos:inScheme thermo:variables .

thermo:PressureDifference a owl:Class ;
    rdfs:label "PressureDifference" ;
    schema1:Unit "Pa" ;
    schema1:mathExpression "del_p" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:PureMaterial a owl:Class ;
    rdfs:label "PureMaterial" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c_vm ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c_v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c_p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c_pm ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:kappa ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarHeatCapacityConstantPressure ;
            owl:onProperty thermo:c_pm ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarMass ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c_vm ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:IndividualGasConstant ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificHeatCapacityConstantVolume ;
            owl:onProperty thermo:c_v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:EquationOfState ;
            owl:onProperty thermo:equation_of_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c_pm ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:UniversalGasConstant ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:kappa ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarHeatCapacityConstantVolume ;
            owl:onProperty thermo:c_vm ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificHeatCapacityConstantPressure ;
            owl:onProperty thermo:c_p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:equation_of_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c_p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:HeatCapacityRatio ;
            owl:onProperty thermo:kappa ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:equation_of_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c_v ],
        thermo:Material ;
    skos:altLabel "pure material" ;
    skos:definition "A pure material consists of one homogeneous substance with certain material behaviour properties." ;
    skos:inScheme thermo:concepts .

thermo:SpecificDensity a owl:Class ;
    rdfs:label "SpecificDensity" ;
    schema1:Unit "kg/m^3" ;
    schema1:mathExpression "rho" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:SpecificProperty,
        thermo:Variable ;
    skos:altLabel "specific density" ;
    skos:inScheme thermo:variables .

thermo:SpecificEnthalpyDifference a owl:Class ;
    rdfs:label "SpecificEnthalpyDifference" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "del_h" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificEntropy a owl:Class ;
    rdfs:label "SpecificEntropy" ;
    schema1:Unit "J/(kg K)" ;
    schema1:mathExpression "s" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "specific entropy" ;
    skos:inScheme thermo:variables .

thermo:SpecificHeatCapacityConstantPressure a owl:Class ;
    rdfs:label "SpecificHeatCapacityConstantPressure" ;
    schema1:Unit "J/K" ;
    schema1:mathExpression "c_p" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:MaterialProperty,
        thermo:SpecificProperty,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:SpecificHeatCapacityConstantVolume a owl:Class ;
    rdfs:label "SpecificHeatCapacityConstantVolume" ;
    schema1:Unit "J/(kg K)" ;
    schema1:mathExpression "c_v" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:MaterialProperty,
        thermo:SpecificProperty,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:SpecificInternalEnergyDifference a owl:Class ;
    rdfs:label "SpecificInternalEnergyDifference" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "del_u" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificKineticEnergyCenterMass a owl:Class ;
    rdfs:label "SpecificKineticEnergyCenterMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "e_kin" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "specific kinetic energy",
        "specific kinetic energy center mass" ;
    skos:inScheme thermo:variables .

thermo:SpecificKineticEnergyCenterMassDifference a owl:Class ;
    rdfs:label "SpecificKineticEnergyCenterMassDifference" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "del_e_kin" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificPotentialEnergyCenterMass a owl:Class ;
    rdfs:label "SpecificPotentialEnergyCenterMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "e_pot" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "specific potential energy",
        "specific potential energy center mass" ;
    skos:inScheme thermo:variables .

thermo:SpecificPotentialEnergyCenterMassDifference a owl:Class ;
    rdfs:label "SpecificPotentialEnergyCenterMassDifference" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "del_e_pot" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificVolumeDifference a owl:Class ;
    rdfs:label "SpecificVolumeDifference" ;
    schema1:Unit "m^3/kg" ;
    schema1:mathExpression "del_v" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:StandardTemperature a owl:Class ;
    rdfs:label "StandardTemperature" ;
    schema1:Unit "K" ;
    schema1:mathExpression "T_0" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        thermo:UniversalQuantity,
        thermo:Variable ;
    skos:altLabel "standard temperature" ;
    skos:inScheme thermo:variables .

thermo:StirringWork a owl:Class ;
    rdfs:label "StirringWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_stir" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:StirringWorkPerMass a owl:Class ;
    rdfs:label "StirringWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_stir" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:TechnicalWorkPerMass a owl:Class ;
    rdfs:label "TechnicalWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_t" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:TemperatureDifference a owl:Class ;
    rdfs:label "TemperatureDifference" ;
    schema1:Unit "K" ;
    schema1:mathExpression "del_T" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:VelocityCenterMass a owl:Class ;
    rdfs:label "VelocityCenterMass" ;
    schema1:Unit "m/s" ;
    schema1:mathExpression "c" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "velocity of center of mass" ;
    skos:inScheme thermo:variables .

thermo:VelocityCenterMassDifference a owl:Class ;
    rdfs:label "VelocityCenterMassDifference" ;
    schema1:Unit "none" ;
    schema1:mathExpression "del_c" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:VolumeDifference a owl:Class ;
    rdfs:label "VolumeDifference" ;
    schema1:Unit "m^3" ;
    schema1:mathExpression "del_V" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:VolumeWork a owl:Class ;
    rdfs:label "VolumeWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_vol" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:VolumeWorkPerMass a owl:Class ;
    rdfs:label "VolumeWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_vol" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:WorkPerMass a owl:Class ;
    rdfs:label "WorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:changes_of_state a owl:ObjectProperty ;
    rdfs:label "changes_of_state" ;
    rdfs:range thermo:ChangeOfState ;
    skos:inScheme thermo:concepts .

thermo:states a owl:ObjectProperty ;
    rdfs:label "states" ;
    rdfs:range thermo:State ;
    skos:inScheme thermo:concepts .

thermo:ChangeOfStateEquation a owl:Class ;
    rdfs:label "ChangeOfStateEquation" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ChangeOfState ;
            owl:onProperty thermo:change_of_state ],
        thermo:Equation ;
    skos:inScheme thermo:equations .

thermo:ClosedSystemRule a owl:Class ;
    rdfs:label "ClosedSystemRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:E_kin a owl:ObjectProperty ;
    rdfs:label "E_kin" ;
    rdfs:range thermo:KineticEnergyCenterMass ;
    skos:inScheme thermo:concepts .

thermo:E_pot a owl:ObjectProperty ;
    rdfs:label "E_pot" ;
    rdfs:range thermo:PotentialEnergyCenterMass ;
    skos:inScheme thermo:concepts .

thermo:H a owl:ObjectProperty ;
    rdfs:label "H" ;
    rdfs:range thermo:Enthalpy ;
    skos:inScheme thermo:concepts .

thermo:Heat a owl:Class ;
    rdfs:label "Heat" ;
    schema1:Unit "J" ;
    schema1:mathExpression "Q" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:definition "Heat is energy transferred due to temperature differences only." ;
    skos:inScheme thermo:variables .

thermo:HomogeneousSystemRule a owl:Class ;
    rdfs:label "HomogeneousSystemRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:IdealGasEquation a owl:Class ;
    rdfs:label "IdealGasEquation" ;
    rdfs:subClassOf thermo:Equation,
        thermo:IdealGasRule ;
    skos:inScheme thermo:idealGasEquations .

thermo:InternalEnergyDifference a owl:Class ;
    rdfs:label "InternalEnergyDifference" ;
    schema1:Unit "J" ;
    schema1:mathExpression "del_U" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:KineticEnergyCenterMassDifference a owl:Class ;
    rdfs:label "KineticEnergyCenterMassDifference" ;
    schema1:Unit "J" ;
    schema1:mathExpression "del_E_kin" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:PotentialEnergyCenterMassDifference a owl:Class ;
    rdfs:label "PotentialEnergyCenterMassDifference" ;
    schema1:Unit "J" ;
    schema1:mathExpression "del_E_pot" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:S a owl:ObjectProperty ;
    rdfs:label "S" ;
    rdfs:range thermo:Entropy ;
    skos:inScheme thermo:concepts .

thermo:SpecificEnthalpy a owl:Class ;
    rdfs:label "SpecificEnthalpy" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "h" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:SpecificProperty,
        thermo:Variable ;
    skos:altLabel "specific enthalpy" ;
    skos:inScheme thermo:variables .

thermo:SpecificEntropyDifference a owl:Class ;
    rdfs:label "SpecificEntropyDifference" ;
    schema1:Unit "J/(kg K)" ;
    schema1:mathExpression "del_s" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificInternalEnergy a owl:Class ;
    rdfs:label "SpecificInternalEnergy" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "u" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:SpecificProperty,
        thermo:Variable ;
    skos:altLabel "specific internal energy" ;
    skos:inScheme thermo:variables .

thermo:StateEquation a owl:Class ;
    rdfs:label "StateEquation" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:state ],
        thermo:Equation ;
    skos:inScheme thermo:equations .

thermo:SystemInEquilibriumRule a owl:Class ;
    rdfs:label "SystemInEquilibriumRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:T0 a owl:ObjectProperty ;
    rdfs:label "T0" ;
    rdfs:range thermo:StandardTemperature ;
    skos:inScheme thermo:concepts .

thermo:U a owl:ObjectProperty ;
    rdfs:label "U" ;
    rdfs:range thermo:InternalEnergy ;
    skos:inScheme thermo:concepts .

thermo:UniversalGasConstant a owl:Class ;
    rdfs:label "UniversalGasConstant" ;
    schema1:Unit "J/(K mol)" ;
    schema1:mathExpression "Rbar" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        thermo:UniversalQuantity,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:UniversalQuantity a owl:Class ;
    rdfs:label "UniversalQuantity" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "universal property",
        "universal quantity" ;
    skos:definition "Variable that always has the same value." ;
    skos:inScheme thermo:variables .

thermo:W_a a owl:ObjectProperty ;
    rdfs:label "W_a" ;
    rdfs:range thermo:ExternalWork ;
    skos:inScheme thermo:concepts .

thermo:W_electrical a owl:ObjectProperty ;
    rdfs:label "W_electrical" ;
    rdfs:range thermo:ElectricalWork ;
    skos:inScheme thermo:concepts .

thermo:W_i a owl:ObjectProperty ;
    rdfs:label "W_i" ;
    rdfs:range thermo:InternalWork ;
    skos:inScheme thermo:concepts .

thermo:W_stir a owl:ObjectProperty ;
    rdfs:label "W_stir" ;
    rdfs:range thermo:StirringWork ;
    skos:inScheme thermo:concepts .

thermo:W_vol a owl:ObjectProperty ;
    rdfs:label "W_vol" ;
    rdfs:range thermo:VolumeWork ;
    skos:inScheme thermo:concepts .

thermo:Work a owl:Class ;
    rdfs:label "Work" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:adiabatic a owl:DatatypeProperty ;
    rdfs:label "adiabatic" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:c a owl:ObjectProperty ;
    rdfs:label "c" ;
    rdfs:range thermo:VelocityCenterMass ;
    skos:inScheme thermo:concepts .

thermo:c_p a owl:ObjectProperty ;
    rdfs:label "c_p" ;
    rdfs:range thermo:SpecificHeatCapacityConstantPressure ;
    skos:inScheme thermo:concepts .

thermo:c_pm a owl:ObjectProperty ;
    rdfs:label "c_pm" ;
    rdfs:range thermo:MolarHeatCapacityConstantPressure ;
    skos:inScheme thermo:concepts .

thermo:c_v a owl:ObjectProperty ;
    rdfs:label "c_v" ;
    rdfs:range thermo:SpecificHeatCapacityConstantVolume ;
    skos:inScheme thermo:concepts .

thermo:c_vm a owl:ObjectProperty ;
    rdfs:label "c_vm" ;
    rdfs:range thermo:MolarHeatCapacityConstantVolume ;
    skos:inScheme thermo:concepts .

thermo:closed a owl:DatatypeProperty ;
    rdfs:label "closed" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:del_H a owl:ObjectProperty ;
    rdfs:label "del_H" ;
    rdfs:range thermo:EnthalpyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_S a owl:ObjectProperty ;
    rdfs:label "del_S" ;
    rdfs:range thermo:EntropyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_T a owl:ObjectProperty ;
    rdfs:label "del_T" ;
    rdfs:range thermo:TemperatureDifference ;
    skos:inScheme thermo:concepts .

thermo:del_V a owl:ObjectProperty ;
    rdfs:label "del_V" ;
    rdfs:range thermo:VolumeDifference ;
    skos:inScheme thermo:concepts .

thermo:del_c a owl:ObjectProperty ;
    rdfs:label "del_c" ;
    rdfs:range thermo:VelocityCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_e_kin a owl:ObjectProperty ;
    rdfs:label "del_e_kin" ;
    rdfs:range thermo:SpecificKineticEnergyCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_e_pot a owl:ObjectProperty ;
    rdfs:label "del_e_pot" ;
    rdfs:range thermo:SpecificPotentialEnergyCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_h a owl:ObjectProperty ;
    rdfs:label "del_h" ;
    rdfs:range thermo:SpecificEnthalpyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_p a owl:ObjectProperty ;
    rdfs:label "del_p" ;
    rdfs:range thermo:PressureDifference ;
    skos:inScheme thermo:concepts .

thermo:del_u a owl:ObjectProperty ;
    rdfs:label "del_u" ;
    rdfs:range thermo:SpecificInternalEnergyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_v a owl:ObjectProperty ;
    rdfs:label "del_v" ;
    rdfs:range thermo:SpecificVolumeDifference ;
    skos:inScheme thermo:concepts .

thermo:del_z a owl:ObjectProperty ;
    rdfs:label "del_z" ;
    rdfs:range thermo:PositionCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:e_kin a owl:ObjectProperty ;
    rdfs:label "e_kin" ;
    rdfs:range thermo:SpecificKineticEnergyCenterMass ;
    skos:inScheme thermo:concepts .

thermo:e_pot a owl:ObjectProperty ;
    rdfs:label "e_pot" ;
    rdfs:range thermo:SpecificPotentialEnergyCenterMass ;
    skos:inScheme thermo:concepts .

thermo:equation_of_state a owl:ObjectProperty ;
    rdfs:label "equation_of_state" ;
    rdfs:range thermo:EquationOfState ;
    skos:inScheme thermo:concepts .

thermo:final_state a owl:ObjectProperty ;
    rdfs:label "final_state" ;
    rdfs:range thermo:State ;
    skos:inScheme thermo:concepts .

thermo:index a owl:DatatypeProperty ;
    rdfs:label "index" ;
    skos:inScheme thermo:concepts .

thermo:initial_state a owl:ObjectProperty ;
    rdfs:label "initial_state" ;
    rdfs:range thermo:State ;
    skos:inScheme thermo:concepts .

thermo:kappa a owl:ObjectProperty ;
    rdfs:label "kappa" ;
    rdfs:range thermo:HeatCapacityRatio ;
    skos:inScheme thermo:concepts .

thermo:material a owl:ObjectProperty ;
    rdfs:label "material" ;
    rdfs:range thermo:PureMaterial ;
    skos:inScheme thermo:concepts .

thermo:model a owl:ObjectProperty ;
    rdfs:label "model" ;
    rdfs:range thermo:EquationOfStateModels ;
    skos:inScheme thermo:concepts .

thermo:polytropic_index a owl:ObjectProperty ;
    rdfs:label "polytropic_index" ;
    rdfs:range thermo:PolytropicIndex ;
    skos:inScheme thermo:concepts .

thermo:q a owl:ObjectProperty ;
    rdfs:label "q" ;
    rdfs:range thermo:HeatPerMass ;
    skos:inScheme thermo:concepts .

thermo:reversible a owl:DatatypeProperty ;
    rdfs:label "reversible" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:rho a owl:ObjectProperty ;
    rdfs:label "rho" ;
    rdfs:range thermo:SpecificDensity ;
    skos:inScheme thermo:concepts .

thermo:s a owl:ObjectProperty ;
    rdfs:label "s" ;
    rdfs:range thermo:SpecificEntropy ;
    skos:inScheme thermo:concepts .

thermo:state a owl:ObjectProperty ;
    rdfs:label "state" ;
    rdfs:range thermo:State ;
    skos:inScheme thermo:concepts .

thermo:w a owl:ObjectProperty ;
    rdfs:label "w" ;
    rdfs:range thermo:WorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_a a owl:ObjectProperty ;
    rdfs:label "w_a" ;
    rdfs:range thermo:ExternalWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_electrical a owl:ObjectProperty ;
    rdfs:label "w_electrical" ;
    rdfs:range thermo:ElectricalWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_i a owl:ObjectProperty ;
    rdfs:label "w_i" ;
    rdfs:range thermo:InternalWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_stir a owl:ObjectProperty ;
    rdfs:label "w_stir" ;
    rdfs:range thermo:StirringWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_t a owl:ObjectProperty ;
    rdfs:label "w_t" ;
    rdfs:range thermo:TechnicalWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_vol a owl:ObjectProperty ;
    rdfs:label "w_vol" ;
    rdfs:range thermo:VolumeWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:z a owl:ObjectProperty ;
    rdfs:label "z" ;
    rdfs:range thermo:PositionCenterMass ;
    skos:inScheme thermo:concepts .

thermo:AmountOfSubstance a owl:Class ;
    rdfs:label "AmountOfSubstance" ;
    schema1:Unit "mol" ;
    schema1:mathExpression "n" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:Variable ;
    skos:altLabel "amount of substance" ;
    skos:inScheme thermo:variables .

thermo:Equation a owl:Class ;
    rdfs:label "Equation" ;
    rdfs:subClassOf thermo:MathematicalFormula ;
    skos:inScheme thermo:equations .

thermo:EquationOfStateModels a owl:Class ;
    owl:unionOf ( <https://example.org/thermodynamics/EquationOfStateModels#ideal+gas> <https://example.org/thermodynamics/EquationOfStateModels#van+der+Waals> ) ;
    linkml:permissible_values <https://example.org/thermodynamics/EquationOfStateModels#ideal+gas>,
        <https://example.org/thermodynamics/EquationOfStateModels#van+der+Waals> .

thermo:IndividualGasConstant a owl:Class ;
    rdfs:label "IndividualGasConstant" ;
    schema1:Unit "J/(kg K)" ;
    schema1:mathExpression "R" ;
    rdfs:subClassOf thermo:MaterialProperty,
        thermo:Variable ;
    skos:altLabel "individual gas constant",
        "specific gas constant" ;
    skos:inScheme thermo:variables .

thermo:Mass a owl:Class ;
    rdfs:label "Mass" ;
    schema1:Unit "kg" ;
    schema1:mathExpression "m" ;
    rdfs:subClassOf thermo:Variable ;
    skos:altLabel "mass" ;
    skos:inScheme thermo:variables .

thermo:MolarMass a owl:Class ;
    rdfs:label "MolarMass" ;
    schema1:Unit "kg/mol" ;
    schema1:mathExpression "M" ;
    rdfs:subClassOf thermo:MaterialProperty,
        thermo:Variable ;
    skos:altLabel "molar mass" ;
    skos:inScheme thermo:variables .

thermo:SpecificVolume a owl:Class ;
    rdfs:label "SpecificVolume" ;
    schema1:Unit "m^3/kg" ;
    schema1:mathExpression "v" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:SpecificProperty,
        thermo:Variable ;
    skos:altLabel "specific volume" ;
    skos:inScheme thermo:variables .

thermo:Volume a owl:Class ;
    rdfs:label "Volume" ;
    schema1:Unit "m^3" ;
    schema1:mathExpression "V" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "volume" ;
    skos:inScheme thermo:variables .

thermo:ChangeOfState a owl:Class ;
    rdfs:label "ChangeOfState" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:VolumeWorkPerMass ;
            owl:onProperty thermo:w_vol ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_electrical ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_h ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:StirringWork ;
            owl:onProperty thermo:W_stir ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_u ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_a ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:WorkPerMass ;
            owl:onProperty thermo:w ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_vol ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:EnthalpyDifference ;
            owl:onProperty thermo:del_H ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:initial_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalWorkPerMass ;
            owl:onProperty thermo:w_i ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalWork ;
            owl:onProperty thermo:W_i ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_vol ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_t ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_h ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_H ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:adiabatic ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PotentialEnergyCenterMassDifference ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:reversible ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_stir ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VolumeDifference ;
            owl:onProperty thermo:del_V ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_e_pot ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_e_kin ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_a ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificKineticEnergyCenterMassDifference ;
            owl:onProperty thermo:del_e_kin ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:reversible ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_e_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_V ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:polytropic_index ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_t ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:adiabatic ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:TemperatureDifference ;
            owl:onProperty thermo:del_T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_vol ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificPotentialEnergyCenterMassDifference ;
            owl:onProperty thermo:del_e_pot ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PositionCenterMassDifference ;
            owl:onProperty thermo:del_z ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:q ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:q ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_vol ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_p ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ElectricalWorkPerMass ;
            owl:onProperty thermo:w_electrical ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:final_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEnthalpyDifference ;
            owl:onProperty thermo:del_h ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_stir ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ExternalWork ;
            owl:onProperty thermo:W_a ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_a ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_z ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEntropyDifference ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_z ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PolytropicIndex ;
            owl:onProperty thermo:polytropic_index ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:initial_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:polytropic_index ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_i ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VolumeWork ;
            owl:onProperty thermo:W_vol ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:HeatPerMass ;
            owl:onProperty thermo:q ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificInternalEnergyDifference ;
            owl:onProperty thermo:del_u ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_electrical ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_i ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_i ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PressureDifference ;
            owl:onProperty thermo:del_p ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificVolumeDifference ;
            owl:onProperty thermo:del_v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:final_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_stir ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_stir ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalEnergyDifference ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:KineticEnergyCenterMassDifference ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_electrical ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:StirringWorkPerMass ;
            owl:onProperty thermo:w_stir ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_electrical ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Heat ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:initial_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:final_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ExternalWorkPerMass ;
            owl:onProperty thermo:w_a ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ElectricalWork ;
            owl:onProperty thermo:W_electrical ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VelocityCenterMassDifference ;
            owl:onProperty thermo:del_c ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_i ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_c ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_V ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:reversible ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:EntropyDifference ;
            owl:onProperty thermo:del_S ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_c ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_u ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:TechnicalWorkPerMass ;
            owl:onProperty thermo:w_t ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_S ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Work ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_T ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_H ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_S ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:adiabatic ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_e_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_a ],
        thermo:Concept ;
    skos:altLabel "change of state" ;
    skos:inScheme thermo:concepts .

thermo:Concept a owl:Class ;
    rdfs:label "Concept" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:index ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:index ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:index ],
        [ a owl:Restriction ;
            owl:minCardinality 1 ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:id ],
        thermo:Element ;
    skos:inScheme thermo:concepts .

thermo:ExtensiveStateVariable a owl:Class ;
    rdfs:label "ExtensiveStateVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "extensive property" ;
    skos:definition "The value of an extensive property of a homogenous system is  proportional to the mass of the system.  We denote them by upper case letters." ;
    skos:inScheme thermo:variables .

thermo:Temperature a owl:Class ;
    rdfs:label "Temperature" ;
    schema1:Unit "K" ;
    schema1:mathExpression "T" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "temperature" ;
    skos:inScheme thermo:variables .

thermo:ExternalStateVariable a owl:Class ;
    rdfs:label "ExternalStateVariable" ;
    rdfs:subClassOf thermo:StateVariable ;
    skos:altLabel "external state variable" ;
    skos:definition "External state variables are state variables that depend on the internal state variables of the systems  and its interactions with the surroundings." ;
    skos:inScheme thermo:variables .

thermo:MaterialProperty a owl:Class ;
    rdfs:label "MaterialProperty" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "material property" ;
    skos:definition "Properties that describe a material." ;
    skos:inScheme thermo:variables .

thermo:Pressure a owl:Class ;
    rdfs:label "Pressure" ;
    schema1:Unit "Pa" ;
    schema1:mathExpression "p" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "pressure" ;
    skos:inScheme thermo:variables .

thermo:Q a owl:ObjectProperty ;
    rdfs:label "Q" ;
    rdfs:range thermo:Heat ;
    skos:inScheme thermo:concepts .

thermo:Rbar a owl:ObjectProperty ;
    rdfs:label "Rbar" ;
    rdfs:range thermo:UniversalGasConstant ;
    skos:inScheme thermo:concepts .

thermo:SpecificProperty a owl:Class ;
    rdfs:label "SpecificProperty" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "specific property" ;
    skos:definition "Specific properties are extensive properties per unit mass.  We denote them by lower case letters." ;
    skos:inScheme thermo:variables .

thermo:System a owl:Class ;
    rdfs:label "System" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:material ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:closed ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:closed ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:states ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PureMaterial ;
            owl:onProperty thermo:material ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:AmountOfSubstance ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:states ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Mass ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarMass ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:material ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:changes_of_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:closed ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ChangeOfState ;
            owl:onProperty thermo:changes_of_state ],
        thermo:Concept ;
    skos:altLabel "system" ;
    skos:definition "Is the part of the universe, we are studying." ;
    skos:inScheme thermo:concepts .

thermo:W a owl:ObjectProperty ;
    rdfs:label "W" ;
    rdfs:range thermo:Work ;
    skos:inScheme thermo:concepts .

thermo:change_of_state a owl:ObjectProperty ;
    rdfs:label "change_of_state" ;
    rdfs:range thermo:ChangeOfState ;
    skos:inScheme thermo:concepts .

thermo:del_E_kin a owl:ObjectProperty ;
    rdfs:label "del_E_kin" ;
    rdfs:range thermo:KineticEnergyCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_E_pot a owl:ObjectProperty ;
    rdfs:label "del_E_pot" ;
    rdfs:range thermo:PotentialEnergyCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_U a owl:ObjectProperty ;
    rdfs:label "del_U" ;
    rdfs:range thermo:InternalEnergyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_s a owl:ObjectProperty ;
    rdfs:label "del_s" ;
    rdfs:range thermo:SpecificEntropyDifference ;
    skos:inScheme thermo:concepts .

thermo:h a owl:ObjectProperty ;
    rdfs:label "h" ;
    rdfs:range thermo:SpecificEnthalpy ;
    skos:inScheme thermo:concepts .

thermo:homogeneous a owl:DatatypeProperty ;
    rdfs:label "homogeneous" ;
    rdfs:range xsd:boolean ;
    skos:definition "A system is homogenous if at all locations inside the system all intesive  state variables have the same value." ;
    skos:inScheme thermo:concepts .

thermo:id a owl:DatatypeProperty ;
    rdfs:label "id" ;
    skos:inScheme thermo:concepts,
        thermo:variables .

thermo:motion a owl:DatatypeProperty ;
    rdfs:label "motion" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:u a owl:ObjectProperty ;
    rdfs:label "u" ;
    rdfs:range thermo:SpecificInternalEnergy ;
    skos:inScheme thermo:concepts .

thermo:StateVariable a owl:Class ;
    rdfs:label "StateVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "state variable" ;
    skos:definition "Measurable variables that characterize the state of a system." ;
    skos:inScheme thermo:variables .

thermo:State a owl:Class ;
    rdfs:label "State" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:StandardTemperature ;
            owl:onProperty thermo:T0 ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:U ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:S ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEnthalpy ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:E_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:e_pot ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Volume ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificKineticEnergyCenterMass ;
            owl:onProperty thermo:e_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PositionCenterMass ;
            owl:onProperty thermo:z ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Enthalpy ;
            owl:onProperty thermo:H ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:z ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:e_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:z ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T0 ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Entropy ;
            owl:onProperty thermo:S ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalEnergy ;
            owl:onProperty thermo:U ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:E_kin ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:s ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:S ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:rho ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:s ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Temperature ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VelocityCenterMass ;
            owl:onProperty thermo:c ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificPotentialEnergyCenterMass ;
            owl:onProperty thermo:e_pot ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:e_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:rho ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:H ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:E_kin ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:System ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:H ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T0 ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:KineticEnergyCenterMass ;
            owl:onProperty thermo:E_kin ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:e_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PotentialEnergyCenterMass ;
            owl:onProperty thermo:E_pot ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEntropy ;
            owl:onProperty thermo:s ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:U ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificVolume ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificDensity ;
            owl:onProperty thermo:rho ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificInternalEnergy ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:E_pot ],
        thermo:Concept ;
    skos:altLabel "state" ;
    skos:definition "The thermodynamic state of a system is characterized by macroscopic,  measurable properties sufficient to determine all other  macroscopic properties." ;
    skos:inScheme thermo:concepts .

thermo:VariableConcept a owl:Class ;
    rdfs:label "VariableConcept" ;
    skos:inScheme thermo:variables .

thermo:M a owl:ObjectProperty ;
    rdfs:label "M" ;
    rdfs:range thermo:MolarMass ;
    skos:inScheme thermo:concepts .

thermo:R a owl:ObjectProperty ;
    rdfs:label "R" ;
    rdfs:range thermo:IndividualGasConstant ;
    skos:inScheme thermo:concepts .

thermo:V a owl:ObjectProperty ;
    rdfs:label "V" ;
    rdfs:range thermo:Volume ;
    skos:inScheme thermo:concepts .

thermo:equilibrium a owl:DatatypeProperty ;
    rdfs:label "equilibrium" ;
    rdfs:range xsd:boolean ;
    skos:definition "A system is in equilibrium if no changes occur if it is isolated from  its surroundings" ;
    skos:inScheme thermo:concepts .

thermo:m a owl:ObjectProperty ;
    rdfs:label "m" ;
    rdfs:range thermo:Mass ;
    skos:inScheme thermo:concepts .

thermo:n a owl:ObjectProperty ;
    rdfs:label "n" ;
    rdfs:range thermo:AmountOfSubstance ;
    skos:inScheme thermo:concepts .

thermo:system a owl:ObjectProperty ;
    rdfs:label "system" ;
    rdfs:range thermo:System ;
    skos:inScheme thermo:concepts .

thermo:v a owl:ObjectProperty ;
    rdfs:label "v" ;
    rdfs:range thermo:SpecificVolume ;
    skos:inScheme thermo:concepts .

thermo:SystemInStateEquation a owl:Class ;
    rdfs:label "SystemInStateEquation" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:System ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:system ],
        thermo:ClosedSystemRule,
        thermo:HomogeneousSystemRule,
        thermo:StateEquation,
        thermo:SystemInEquilibriumRule ;
    skos:inScheme thermo:equations .

thermo:IntensiveStateVariable a owl:Class ;
    rdfs:label "IntensiveStateVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "intensive property" ;
    skos:definition "The value of an intensive property of a homogenous system does  not vary with the mass of the system. " ;
    skos:inScheme thermo:variables .

thermo:Rule a owl:Class ;
    rdfs:label "Rule" ;
    skos:inScheme thermo:rules .

thermo:T a owl:ObjectProperty ;
    rdfs:label "T" ;
    rdfs:range thermo:Temperature ;
    skos:inScheme thermo:concepts .

thermo:p a owl:ObjectProperty ;
    rdfs:label "p" ;
    rdfs:range thermo:Pressure ;
    skos:inScheme thermo:concepts .

thermo:value a owl:DatatypeProperty ;
    rdfs:label "value" ;
    rdfs:range xsd:float ;
    skos:inScheme thermo:variables .

thermo:ChangeOfStateDifferenceEquation a owl:Class ;
    rdfs:label "ChangeOfStateDifferenceEquation" ;
    rdfs:subClassOf thermo:ChangeOfStateEquation ;
    skos:inScheme thermo:equations .

thermo:Difference a owl:Class ;
    rdfs:label "Difference" ;
    rdfs:subClassOf thermo:DerivedVariable ;
    skos:altLabel "difference" ;
    skos:inScheme thermo:derivedVariables .

thermo:InternalStateVariable a owl:Class ;
    rdfs:label "InternalStateVariable" ;
    rdfs:subClassOf thermo:StateVariable ;
    skos:altLabel "internal state variable" ;
    skos:definition "Describes the state of a system that does not move." ;
    skos:inScheme thermo:variables .

thermo:DefiningEquation a owl:Class ;
    rdfs:label "DefiningEquation" ;
    skos:inScheme thermo:definingEquations .

thermo:ChangeOfStateVariable a owl:Class ;
    rdfs:label "ChangeOfStateVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "change of state variable" ;
    skos:definition "Measurable variables that characterize the change of state of a system." ;
    skos:inScheme thermo:variables .

thermo:Variable a owl:Class ;
    rdfs:label "Variable" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:float ;
            owl:onProperty thermo:value ],
        thermo:Element ;
    skos:altLabel "quantity",
        "variable" ;
    skos:inScheme thermo:variables .

thermo:pureMaterials a owl:ObjectProperty ;
    rdfs:label "pureMaterials" ;
    rdfs:range thermo:PureMaterial ;
    skos:inScheme thermo:problem . 

thermo:Problem a owl:Class ;
    rdfs:label "Problem" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:PureMaterial ;
            owl:onProperty thermo:pureMaterials ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:changes_of_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:System ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ChangeOfState ;
            owl:onProperty thermo:changes_of_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:states ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:pureMaterials ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:name ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:name ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:name ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:states ] ;
    skos:inScheme thermo:problem .
`

const ontologyText2 = `
@prefix dcterms: <http://purl.org/dc/terms/> .
@prefix linkml: <https://w3id.org/linkml/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix pav: <http://purl.org/pav/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix schema1: <http://schema.org/> .
@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix thermo: <https://example.org/thermodynamics/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

thermo:AmountOfSubstanceEquation a owl:Class ;
    rdfs:label "AmountOfSubstanceEquation" ;
    schema1:mathExpression "n = m/M_i" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Mass ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarMass ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:AmountOfSubstance ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:m ],
        thermo:SystemEquation ;
    skos:inScheme thermo:essentialEquations ;
    thermo:codeExpression "m_{system} = M_{system#material}*n_{system}" .

thermo:ClosedSystem a owl:Class ;
    rdfs:label "ClosedSystem" ;
    rdfs:subClassOf thermo:System ;
    skos:altLabel "closed system",
        "control mass" ;
    skos:inScheme thermo:concepts .

thermo:DelCEquation a owl:Class ;
    rdfs:label "DelCEquation" ;
    schema1:mathExpression "del_c = c_1 - c_2" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_c_{change_of_state#transition} = c_{change_of_state#final_state} - c_{change_of_state#initial_state}" .

thermo:DelEKinEquation a owl:Class ;
    rdfs:label "DelEKinEquation" ;
    schema1:mathExpression "del_E_kin = E_kin_1 - E_kin_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_E_kin_{change_of_state#transition} = E_kin_{change_of_state#final_state} - E_kin_{change_of_state#initial_state}" .

thermo:DelEPotEquation a owl:Class ;
    rdfs:label "DelEPotEquation" ;
    schema1:mathExpression "del_E_pot = E_pot_1 - E_pot_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_E_pot_{change_of_state#transition} = E_pot_{change_of_state#final_state} - E_pot_{change_of_state#initial_state}" .

thermo:DelHEquation a owl:Class ;
    rdfs:label "DelHEquation" ;
    schema1:mathExpression "del_H = H_1 - H_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_H_{change_of_state#transition} = H_{change_of_state#final_state} - H_{change_of_state#initial_state}" .

thermo:DelPEquation a owl:Class ;
    rdfs:label "DelPEquation" ;
    schema1:mathExpression "del_p = p_1 - p_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_p_{change_of_state#transition} = p_{change_of_state#final_state} - p_{change_of_state#initial_state}" .

thermo:DelSEquation a owl:Class ;
    rdfs:label "DelSEquation" ;
    schema1:mathExpression "del_S = S_1 - S_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_S_{change_of_state#transition} = S_{change_of_state#final_state} - S_{change_of_state#initial_state}" .

thermo:DelTEquation a owl:Class ;
    rdfs:label "DelTEquation" ;
    schema1:mathExpression "del_T = T_1 - T_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_T_{change_of_state#transition} = T_{change_of_state#final_state} - T_{change_of_state#initial_state}" .

thermo:DelUEquation a owl:Class ;
    rdfs:label "DelUEquation" ;
    schema1:mathExpression "del_U = U_1 - U_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_U_{change_of_state#transition} = U_{change_of_state#final_state} - U_{change_of_state#initial_state}" .

thermo:DelVEquation a owl:Class ;
    rdfs:label "DelVEquation" ;
    schema1:mathExpression "del_V = V_1 - V_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_V_{change_of_state#transition} = V_{change_of_state#final_state} - V_{change_of_state#initial_state}" .

thermo:DelZEquation a owl:Class ;
    rdfs:label "DelZEquation" ;
    schema1:mathExpression "del_z = z_1 - z_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_z_{change_of_state#transition} = z_{change_of_state#final_state} - z_{change_of_state#initial_state}" .

thermo:DeleKinEquation a owl:Class ;
    rdfs:label "DeleKinEquation" ;
    schema1:mathExpression "del_e_kin = e_kin_1 - e_kin_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_e_kin_{change_of_state#transition} = e_kin_{change_of_state#final_state} - e_kin_{change_of_state#initial_state}" .

thermo:DelePotEquation a owl:Class ;
    rdfs:label "DelePotEquation" ;
    schema1:mathExpression "del_e_pot = e_pot_1 - e_pot_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_e_pot_{change_of_state#transition} = e_pot_{change_of_state#final_state} - e_pot_{change_of_state#initial_state}" .

thermo:DelhEquation a owl:Class ;
    rdfs:label "DelhEquation" ;
    schema1:mathExpression "del_h = h_0 - h_1" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_h_{change_of_state#transition} = h_{change_of_state#final_state} - h_{change_of_state#initial_state}" .

thermo:DelsEquation a owl:Class ;
    rdfs:label "DelsEquation" ;
    schema1:mathExpression "del_s = s_1 - s_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_s_{change_of_state#transition} = s_{change_of_state#final_state} - s_{change_of_state#initial_state}" .

thermo:DeluEquation a owl:Class ;
    rdfs:label "DeluEquation" ;
    schema1:mathExpression "del_u = u_1 - u_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_u_{change_of_state#transition} = u_{change_of_state#final_state} - u_{change_of_state#initial_state}" .

thermo:DelvEquation a owl:Class ;
    rdfs:label "DelvEquation" ;
    schema1:mathExpression "del_v = v_1 - v_0" ;
    rdfs:subClassOf thermo:ChangeOfStateDifferenceEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "del_v_{change_of_state#transition} = v_{change_of_state#final_state} - v_{change_of_state#initial_state}" .

thermo:DensityEquation a owl:Class ;
    rdfs:label "DensityEquation" ;
    schema1:mathExpression "rho = m/V" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "rho_{state} = m_{system}/V_{state}" .

thermo:FirstLaw a owl:Class ;
    rdfs:label "FirstLaw" ;
    schema1:mathExpression "Q + W = del_U + del_E_kin + del_E_pot" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:KineticEnergyCenterMassDifference ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Work ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Heat ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PotentialEnergyCenterMassDifference ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalEnergyDifference ;
            owl:onProperty thermo:del_U ],
        thermo:ChangeOfStateEquation ;
    skos:inScheme thermo:essentialEquations ;
    thermo:codeExpression "Q_{change_of_state} + W_{change_of_state} = del_U_{change_of_state} + del_E_kin_{change_of_state} + del_E_pot_{change_of_state}" .

thermo:IdealGasLaw a owl:Class ;
    rdfs:label "IdealGasLaw" ;
    schema1:mathExpression "p * V = m * R * T" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Mass ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Volume ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:IndividualGasConstant ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Temperature ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:V ],
        thermo:IdealGasEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:idealGasEquations ;
    thermo:codeExpression "p_{state} * V_{state} = m_{system} * R_{system.material} * T_{state}" .

thermo:IdealGasLawAmountOfSubstance a owl:Class ;
    rdfs:label "IdealGasLawAmountOfSubstance" ;
    schema1:mathExpression "p * V = n * Rbar * T" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Temperature ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Volume ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:AmountOfSubstance ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:UniversalGasConstant ;
            owl:onProperty thermo:Rbar ],
        thermo:DerivedEquation,
        thermo:IdealGasEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:idealGasEquations ;
    thermo:codeExpression "p_{state} * V_{state} = n_{system} * Rbar_{system#material} * T_{state}" .

thermo:Mixture a owl:Class ;
    rdfs:label "Mixture" ;
    rdfs:subClassOf thermo:Material ;
    skos:altLabel "mixture of materials",
        "substance mixture" ;
    skos:definition "A mixture consist of multiple (pure) substances." ;
    skos:inScheme thermo:concepts .

thermo:OpenSystem a owl:Class ;
    rdfs:label "OpenSystem" ;
    rdfs:subClassOf thermo:System ;
    skos:altLabel "control volume",
        "open system" ;
    skos:definition "An open system is a fixed part of the space that we are interested in.  Work and heat as well as matter can be transferred across its boundary. " ;
    skos:inScheme thermo:concepts .

thermo:PolytropicIndexEquation a owl:Class ;
    rdfs:label "PolytropicIndexEquation" ;
    schema1:mathExpression "polytropic_index = ln(p_0/p_1)/ln(v_0/v_1)" ;
    rdfs:subClassOf thermo:ChangeOfStateEquation,
        thermo:DefiningEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "polytropic_index_{change_of_state#transition} = ln(p_{change_of_state#initial_state} / p_{change_of_state#final_state})/ln(v_{change_of_state#final_state} / v_{change_of_state#initial_state})" .

thermo:SecondLaw a owl:Class ;
    rdfs:label "SecondLaw" ;
    schema1:mathExpression "del_s > 0" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEntropyDifference ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ChangeOfState ;
            owl:onProperty thermo:change_of_state ],
        thermo:AdiabaticRule,
        thermo:Inequality,
        thermo:IrreversibleRule ;
    skos:inScheme thermo:essentialEquations ;
    thermo:codeExpression "del_s_{change_of_state} > 0" .

thermo:SpecificEnthalpyEquation a owl:Class ;
    rdfs:label "SpecificEnthalpyEquation" ;
    schema1:mathExpression "h = u + p*v" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificVolume ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEnthalpy ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificInternalEnergy ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:v ],
        thermo:StateEquation ;
    skos:inScheme thermo:essentialEquations ;
    thermo:codeExpression "h_{state} = u_{state} + p_{state}*v_{state}" .

thermo:SpecificIdealGasLaw a owl:Class ;
    rdfs:label "SpecificIdealGasLaw" ;
    schema1:mathExpression "p * v = R * T" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Temperature ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificVolume ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:IndividualGasConstant ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        thermo:DerivedEquation,
        thermo:IdealGasEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:idealGasEquations ;
    thermo:codeExpression "p_{state} * v_{state} = R_{system#material} * T_{state}" .

thermo:SpecificKineticEnergyCenterMassEquation a owl:Class ;
    rdfs:label "SpecificKineticEnergyCenterMassEquation" ;
    schema1:mathExpression "e_kin = E_kin/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "e_kin_{state} = E_kin_{state}/m_{system}" .

thermo:SpecificPotentialEnergyCenterMassEquation a owl:Class ;
    rdfs:label "SpecificPotentialEnergyCenterMassEquation" ;
    schema1:mathExpression "e_pot = E_pot/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "e_pot_{state} = E_pot_{state}/m_{system}" .

thermo:SpecificStateVariableHEquation a owl:Class ;
    rdfs:label "SpecificStateVariableHEquation" ;
    schema1:mathExpression "h = H/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "h_{state} = H_{state}/m_{system}" .

thermo:SpecificStateVariableSEquation a owl:Class ;
    rdfs:label "SpecificStateVariableSEquation" ;
    schema1:mathExpression "s = S/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "s_{state} = S_{state}/m_{system}" .

thermo:SpecificStateVariableUEquation a owl:Class ;
    rdfs:label "SpecificStateVariableUEquation" ;
    schema1:mathExpression "u = U/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "u_{state} = U_{state}/m_{system}" .

thermo:SpecificStateVariableVEquation a owl:Class ;
    rdfs:label "SpecificStateVariableVEquation" ;
    schema1:mathExpression "v = V/m" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:SystemInStateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "v_{state} = V_{state}/m_{system}" .

thermo:StandardPressure a owl:Class ;
    rdfs:label "StandardPressure" ;
    schema1:Unit "Pa" ;
    schema1:mathExpression "p_0" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:value ],
        thermo:UniversalQuantity,
        thermo:Variable ;
    skos:altLabel "standard pressure" ;
    skos:inScheme thermo:variables .

thermo:T_const a owl:DatatypeProperty ;
    rdfs:label "T_const" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:ThermalDensityEquation a owl:Class ;
    rdfs:label "ThermalDensityEquation" ;
    schema1:mathExpression "rho = 1/v" ;
    rdfs:subClassOf thermo:DefiningEquation,
        thermo:StateEquation ;
    skos:inScheme thermo:definingEquations ;
    thermo:codeExpression "rho_{state} = 1/v_{state}" .

thermo:is_isenthalpic a owl:DatatypeProperty ;
    rdfs:label "is_isenthalpic" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_isentropic a owl:DatatypeProperty ;
    rdfs:label "is_isentropic" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_isobaric a owl:DatatypeProperty ;
    rdfs:label "is_isobaric" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_isochoric a owl:DatatypeProperty ;
    rdfs:label "is_isochoric" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_isothermal a owl:DatatypeProperty ;
    rdfs:label "is_isothermal" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:is_polytropic a owl:DatatypeProperty ;
    rdfs:label "is_polytropic" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:Inequality a owl:Class ;
    rdfs:label "Inequality" ;
    rdfs:subClassOf thermo:MathematicalFormula ;
    skos:inScheme thermo:equations .

thermo:IsentropicRule a owl:Class ;
    rdfs:label "IsentropicRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:IsobaricRule a owl:Class ;
    rdfs:label "IsobaricRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:IsochoricRule a owl:Class ;
    rdfs:label "IsochoricRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:IsothermalRule a owl:Class ;
    rdfs:label "IsothermalRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:NotInMotionRule a owl:Class ;
    rdfs:label "NotInMotionRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:PolytropicRule a owl:Class ;
    rdfs:label "PolytropicRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:Ratio a owl:Class ;
    rdfs:label "Ratio" ;
    rdfs:subClassOf thermo:DerivedVariable ;
    skos:altLabel "ratio" ;
    skos:inScheme thermo:derivedVariables .

thermo:SystemEquation a owl:Class ;
    rdfs:label "SystemEquation" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:System ;
            owl:onProperty thermo:system ],
        thermo:ClosedSystemRule,
        thermo:Equation,
        thermo:HomogeneousSystemRule,
        thermo:SystemInEquilibriumRule ;
    skos:inScheme thermo:equations .

thermo:AdiabaticRule a owl:Class ;
    rdfs:label "AdiabaticRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:DerivedEquation a owl:Class ;
    rdfs:label "DerivedEquation" ;
    skos:inScheme thermo:idealGasEquations .

thermo:DerivedVariable a owl:Class ;
    rdfs:label "DerivedVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "derived variable" ;
    skos:definition "A variable which can be mathematically derived." ;
    skos:inScheme thermo:derivedVariables .

thermo:ElectricalWork a owl:Class ;
    rdfs:label "ElectricalWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_electrical" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:ElectricalWorkPerMass a owl:Class ;
    rdfs:label "ElectricalWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_electrical" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:Element a owl:Class ;
    rdfs:label "Element" ;
    skos:inScheme thermo:variables .

thermo:Enthalpy a owl:Class ;
    rdfs:label "Enthalpy" ;
    schema1:Unit "J" ;
    schema1:mathExpression "H" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "enthalpy" ;
    skos:inScheme thermo:variables .

thermo:EnthalpyDifference a owl:Class ;
    rdfs:label "EnthalpyDifference" ;
    schema1:Unit "J" ;
    schema1:mathExpression "del_H" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:Entropy a owl:Class ;
    rdfs:label "Entropy" ;
    schema1:Unit "J/K" ;
    schema1:mathExpression "S" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "entropy" ;
    skos:inScheme thermo:variables .

thermo:EntropyDifference a owl:Class ;
    rdfs:label "EntropyDifference" ;
    schema1:Unit "J/K" ;
    schema1:mathExpression "del_S" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:EquationOfState a owl:Class ;
    rdfs:label "EquationOfState" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:model ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:EquationOfStateModels ;
            owl:onProperty thermo:model ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:model ],
        thermo:Concept ;
    skos:altLabel "equation of state" ;
    skos:definition "An EoS is the relation between functions of state, such as temperature (T), pressure (P), volume (V), internal energy or specific heat.  It characterizes the state of matter of a material under a given set of physical conditions.  (https://serc.carleton.edu/NAGTWorkshops/mineralogy/mineral_physics/eos.html)" ;
    skos:inScheme thermo:concepts .

<https://example.org/thermodynamics/EquationOfStateModels#ideal+gas> a owl:Class ;
    rdfs:label "ideal gas" ;
    rdfs:subClassOf thermo:EquationOfStateModels .

<https://example.org/thermodynamics/EquationOfStateModels#van+der+Waals> a owl:Class ;
    rdfs:label "van der Waals" ;
    rdfs:subClassOf thermo:EquationOfStateModels .

thermo:ExternalWork a owl:Class ;
    rdfs:label "ExternalWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_a" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:ExternalWorkPerMass a owl:Class ;
    rdfs:label "ExternalWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_a" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:HeatCapacityRatio a owl:Class ;
    rdfs:label "HeatCapacityRatio" ;
    schema1:Unit "None" ;
    schema1:mathExpression "kappa" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Ratio,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:HeatPerMass a owl:Class ;
    rdfs:label "HeatPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "q" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:IdealGasRule a owl:Class ;
    rdfs:label "IdealGasRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:InternalEnergy a owl:Class ;
    rdfs:label "InternalEnergy" ;
    schema1:Unit "J" ;
    schema1:mathExpression "U" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "internal energy" ;
    skos:inScheme thermo:variables .

thermo:InternalWork a owl:Class ;
    rdfs:label "InternalWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_i" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:InternalWorkPerMass a owl:Class ;
    rdfs:label "InternalWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_i" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:IrreversibleRule a owl:Class ;
    rdfs:label "IrreversibleRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:KineticEnergyCenterMass a owl:Class ;
    rdfs:label "KineticEnergyCenterMass" ;
    schema1:Unit "J" ;
    schema1:mathExpression "E_kin" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "kinetic energy",
        "kinetic energy center mass" ;
    skos:inScheme thermo:variables .

thermo:Material a owl:Class ;
    rdfs:label "Material" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:homogeneous ],
        thermo:Concept ;
    skos:altLabel "material" ;
    skos:inScheme thermo:concepts .

thermo:MathematicalFormula a owl:Class ;
    rdfs:label "MathematicalFormula" ;
    skos:inScheme thermo:equations .

thermo:MolarHeatCapacityConstantPressure a owl:Class ;
    rdfs:label "MolarHeatCapacityConstantPressure" ;
    schema1:Unit "J/(K mol)" ;
    schema1:mathExpression "c_pm" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:MaterialProperty,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:MolarHeatCapacityConstantVolume a owl:Class ;
    rdfs:label "MolarHeatCapacityConstantVolume" ;
    schema1:Unit "J/(K mol)" ;
    schema1:mathExpression "c_vm" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:MaterialProperty,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:PolytropicIndex a owl:Class ;
    rdfs:label "PolytropicIndex" ;
    schema1:Unit "none" ;
    schema1:mathExpression "polytropic_index" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:PositionCenterMass a owl:Class ;
    rdfs:label "PositionCenterMass" ;
    schema1:Unit "none" ;
    schema1:mathExpression "z" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "position of center of mass" ;
    skos:inScheme thermo:variables .

thermo:PositionCenterMassDifference a owl:Class ;
    rdfs:label "PositionCenterMassDifference" ;
    schema1:Unit "none" ;
    schema1:mathExpression "del_z" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:PotentialEnergyCenterMass a owl:Class ;
    rdfs:label "PotentialEnergyCenterMass" ;
    schema1:Unit "J" ;
    schema1:mathExpression "E_pot" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "potential energy",
        "potential energy center mass" ;
    skos:inScheme thermo:variables .

thermo:PressureDifference a owl:Class ;
    rdfs:label "PressureDifference" ;
    schema1:Unit "Pa" ;
    schema1:mathExpression "del_p" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:PureMaterial a owl:Class ;
    rdfs:label "PureMaterial" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c_p ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificHeatCapacityConstantVolume ;
            owl:onProperty thermo:c_v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c_pm ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:kappa ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:kappa ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c_vm ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificHeatCapacityConstantPressure ;
            owl:onProperty thermo:c_p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c_v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarMass ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:UniversalGasConstant ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:HeatCapacityRatio ;
            owl:onProperty thermo:kappa ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarHeatCapacityConstantVolume ;
            owl:onProperty thermo:c_vm ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:EquationOfState ;
            owl:onProperty thermo:equation_of_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c_pm ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarHeatCapacityConstantPressure ;
            owl:onProperty thermo:c_pm ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:equation_of_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:Rbar ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:equation_of_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c_v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:IndividualGasConstant ;
            owl:onProperty thermo:R ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c_vm ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c_p ],
        thermo:Material ;
    skos:altLabel "pure material" ;
    skos:definition "A pure material consists of one homogeneous substance with certain material behaviour properties." ;
    skos:inScheme thermo:concepts .

thermo:SpecificDensity a owl:Class ;
    rdfs:label "SpecificDensity" ;
    schema1:Unit "kg/m^3" ;
    schema1:mathExpression "rho" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:SpecificProperty,
        thermo:Variable ;
    skos:altLabel "specific density" ;
    skos:inScheme thermo:variables .

thermo:SpecificEnthalpyDifference a owl:Class ;
    rdfs:label "SpecificEnthalpyDifference" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "del_h" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificEntropy a owl:Class ;
    rdfs:label "SpecificEntropy" ;
    schema1:Unit "J/(kg K)" ;
    schema1:mathExpression "s" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "specific entropy" ;
    skos:inScheme thermo:variables .

thermo:SpecificHeatCapacityConstantPressure a owl:Class ;
    rdfs:label "SpecificHeatCapacityConstantPressure" ;
    schema1:Unit "J/K" ;
    schema1:mathExpression "c_p" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:MaterialProperty,
        thermo:SpecificProperty,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:SpecificHeatCapacityConstantVolume a owl:Class ;
    rdfs:label "SpecificHeatCapacityConstantVolume" ;
    schema1:Unit "J/(kg K)" ;
    schema1:mathExpression "c_v" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:MaterialProperty,
        thermo:SpecificProperty,
        thermo:StateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:SpecificInternalEnergyDifference a owl:Class ;
    rdfs:label "SpecificInternalEnergyDifference" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "del_u" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificKineticEnergyCenterMass a owl:Class ;
    rdfs:label "SpecificKineticEnergyCenterMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "e_kin" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "specific kinetic energy",
        "specific kinetic energy center mass" ;
    skos:inScheme thermo:variables .

thermo:SpecificKineticEnergyCenterMassDifference a owl:Class ;
    rdfs:label "SpecificKineticEnergyCenterMassDifference" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "del_e_kin" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificPotentialEnergyCenterMass a owl:Class ;
    rdfs:label "SpecificPotentialEnergyCenterMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "e_pot" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "specific potential energy",
        "specific potential energy center mass" ;
    skos:inScheme thermo:variables .

thermo:SpecificPotentialEnergyCenterMassDifference a owl:Class ;
    rdfs:label "SpecificPotentialEnergyCenterMassDifference" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "del_e_pot" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificVolumeDifference a owl:Class ;
    rdfs:label "SpecificVolumeDifference" ;
    schema1:Unit "m^3/kg" ;
    schema1:mathExpression "del_v" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:StandardTemperature a owl:Class ;
    rdfs:label "StandardTemperature" ;
    schema1:Unit "K" ;
    schema1:mathExpression "T_0" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        thermo:UniversalQuantity,
        thermo:Variable ;
    skos:altLabel "standard temperature" ;
    skos:inScheme thermo:variables .

thermo:StateEquation a owl:Class ;
    rdfs:label "StateEquation" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:state ],
        thermo:Equation ;
    skos:inScheme thermo:equations .

thermo:StirringWork a owl:Class ;
    rdfs:label "StirringWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_stir" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:StirringWorkPerMass a owl:Class ;
    rdfs:label "StirringWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_stir" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:TechnicalWorkPerMass a owl:Class ;
    rdfs:label "TechnicalWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_t" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:TemperatureDifference a owl:Class ;
    rdfs:label "TemperatureDifference" ;
    schema1:Unit "K" ;
    schema1:mathExpression "del_T" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:VelocityCenterMass a owl:Class ;
    rdfs:label "VelocityCenterMass" ;
    schema1:Unit "m/s" ;
    schema1:mathExpression "c" ;
    rdfs:subClassOf thermo:ExternalStateVariable,
        thermo:Variable ;
    skos:altLabel "velocity of center of mass" ;
    skos:inScheme thermo:variables .

thermo:VelocityCenterMassDifference a owl:Class ;
    rdfs:label "VelocityCenterMassDifference" ;
    schema1:Unit "none" ;
    schema1:mathExpression "del_c" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:VolumeDifference a owl:Class ;
    rdfs:label "VolumeDifference" ;
    schema1:Unit "m^3" ;
    schema1:mathExpression "del_V" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:VolumeWork a owl:Class ;
    rdfs:label "VolumeWork" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W_vol" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:VolumeWorkPerMass a owl:Class ;
    rdfs:label "VolumeWorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w_vol" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:WorkPerMass a owl:Class ;
    rdfs:label "WorkPerMass" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "w" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:changes_of_state a owl:ObjectProperty ;
    rdfs:label "changes_of_state" ;
    rdfs:range thermo:ChangeOfState ;
    skos:inScheme thermo:concepts .

thermo:states a owl:ObjectProperty ;
    rdfs:label "states" ;
    rdfs:range thermo:State ;
    skos:inScheme thermo:concepts .

thermo:ChangeOfStateEquation a owl:Class ;
    rdfs:label "ChangeOfStateEquation" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ChangeOfState ;
            owl:onProperty thermo:change_of_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:change_of_state ],
        thermo:Equation ;
    skos:inScheme thermo:equations .

thermo:ClosedSystemRule a owl:Class ;
    rdfs:label "ClosedSystemRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:E_kin a owl:ObjectProperty ;
    rdfs:label "E_kin" ;
    rdfs:range thermo:KineticEnergyCenterMass ;
    skos:inScheme thermo:concepts .

thermo:E_pot a owl:ObjectProperty ;
    rdfs:label "E_pot" ;
    rdfs:range thermo:PotentialEnergyCenterMass ;
    skos:inScheme thermo:concepts .

thermo:H a owl:ObjectProperty ;
    rdfs:label "H" ;
    rdfs:range thermo:Enthalpy ;
    skos:inScheme thermo:concepts .

thermo:Heat a owl:Class ;
    rdfs:label "Heat" ;
    schema1:Unit "J" ;
    schema1:mathExpression "Q" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:definition "Heat is energy transferred due to temperature differences only." ;
    skos:inScheme thermo:variables .

thermo:HomogeneousSystemRule a owl:Class ;
    rdfs:label "HomogeneousSystemRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:IdealGasEquation a owl:Class ;
    rdfs:label "IdealGasEquation" ;
    rdfs:subClassOf thermo:Equation,
        thermo:IdealGasRule ;
    skos:inScheme thermo:idealGasEquations .

thermo:InternalEnergyDifference a owl:Class ;
    rdfs:label "InternalEnergyDifference" ;
    schema1:Unit "J" ;
    schema1:mathExpression "del_U" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:KineticEnergyCenterMassDifference a owl:Class ;
    rdfs:label "KineticEnergyCenterMassDifference" ;
    schema1:Unit "J" ;
    schema1:mathExpression "del_E_kin" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:PotentialEnergyCenterMassDifference a owl:Class ;
    rdfs:label "PotentialEnergyCenterMassDifference" ;
    schema1:Unit "J" ;
    schema1:mathExpression "del_E_pot" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:S a owl:ObjectProperty ;
    rdfs:label "S" ;
    rdfs:range thermo:Entropy ;
    skos:inScheme thermo:concepts .

thermo:SpecificEnthalpy a owl:Class ;
    rdfs:label "SpecificEnthalpy" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "h" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:SpecificProperty,
        thermo:Variable ;
    skos:altLabel "specific enthalpy" ;
    skos:inScheme thermo:variables .

thermo:SpecificEntropyDifference a owl:Class ;
    rdfs:label "SpecificEntropyDifference" ;
    schema1:Unit "J/(kg K)" ;
    schema1:mathExpression "del_s" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Difference,
        thermo:Variable ;
    skos:inScheme thermo:derivedVariables .

thermo:SpecificInternalEnergy a owl:Class ;
    rdfs:label "SpecificInternalEnergy" ;
    schema1:Unit "J/kg" ;
    schema1:mathExpression "u" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:SpecificProperty,
        thermo:Variable ;
    skos:altLabel "specific internal energy" ;
    skos:inScheme thermo:variables .

thermo:SystemInEquilibriumRule a owl:Class ;
    rdfs:label "SystemInEquilibriumRule" ;
    rdfs:subClassOf thermo:Rule ;
    skos:inScheme thermo:rules .

thermo:T0 a owl:ObjectProperty ;
    rdfs:label "T0" ;
    rdfs:range thermo:StandardTemperature ;
    skos:inScheme thermo:concepts .

thermo:U a owl:ObjectProperty ;
    rdfs:label "U" ;
    rdfs:range thermo:InternalEnergy ;
    skos:inScheme thermo:concepts .

thermo:UniversalGasConstant a owl:Class ;
    rdfs:label "UniversalGasConstant" ;
    schema1:Unit "J/(K mol)" ;
    schema1:mathExpression "Rbar" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        thermo:UniversalQuantity,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:UniversalQuantity a owl:Class ;
    rdfs:label "UniversalQuantity" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "universal property",
        "universal quantity" ;
    skos:definition "Variable that always has the same value." ;
    skos:inScheme thermo:variables .

thermo:W_a a owl:ObjectProperty ;
    rdfs:label "W_a" ;
    rdfs:range thermo:ExternalWork ;
    skos:inScheme thermo:concepts .

thermo:W_electrical a owl:ObjectProperty ;
    rdfs:label "W_electrical" ;
    rdfs:range thermo:ElectricalWork ;
    skos:inScheme thermo:concepts .

thermo:W_i a owl:ObjectProperty ;
    rdfs:label "W_i" ;
    rdfs:range thermo:InternalWork ;
    skos:inScheme thermo:concepts .

thermo:W_stir a owl:ObjectProperty ;
    rdfs:label "W_stir" ;
    rdfs:range thermo:StirringWork ;
    skos:inScheme thermo:concepts .

thermo:W_vol a owl:ObjectProperty ;
    rdfs:label "W_vol" ;
    rdfs:range thermo:VolumeWork ;
    skos:inScheme thermo:concepts .

thermo:Work a owl:Class ;
    rdfs:label "Work" ;
    schema1:Unit "J" ;
    schema1:mathExpression "W" ;
    rdfs:subClassOf thermo:ChangeOfStateVariable,
        thermo:Variable ;
    skos:inScheme thermo:variables .

thermo:adiabatic a owl:DatatypeProperty ;
    rdfs:label "adiabatic" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:c a owl:ObjectProperty ;
    rdfs:label "c" ;
    rdfs:range thermo:VelocityCenterMass ;
    skos:inScheme thermo:concepts .

thermo:c_p a owl:ObjectProperty ;
    rdfs:label "c_p" ;
    rdfs:range thermo:SpecificHeatCapacityConstantPressure ;
    skos:inScheme thermo:concepts .

thermo:c_pm a owl:ObjectProperty ;
    rdfs:label "c_pm" ;
    rdfs:range thermo:MolarHeatCapacityConstantPressure ;
    skos:inScheme thermo:concepts .

thermo:c_v a owl:ObjectProperty ;
    rdfs:label "c_v" ;
    rdfs:range thermo:SpecificHeatCapacityConstantVolume ;
    skos:inScheme thermo:concepts .

thermo:c_vm a owl:ObjectProperty ;
    rdfs:label "c_vm" ;
    rdfs:range thermo:MolarHeatCapacityConstantVolume ;
    skos:inScheme thermo:concepts .

thermo:closed a owl:DatatypeProperty ;
    rdfs:label "closed" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:del_H a owl:ObjectProperty ;
    rdfs:label "del_H" ;
    rdfs:range thermo:EnthalpyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_S a owl:ObjectProperty ;
    rdfs:label "del_S" ;
    rdfs:range thermo:EntropyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_T a owl:ObjectProperty ;
    rdfs:label "del_T" ;
    rdfs:range thermo:TemperatureDifference ;
    skos:inScheme thermo:concepts .

thermo:del_V a owl:ObjectProperty ;
    rdfs:label "del_V" ;
    rdfs:range thermo:VolumeDifference ;
    skos:inScheme thermo:concepts .

thermo:del_c a owl:ObjectProperty ;
    rdfs:label "del_c" ;
    rdfs:range thermo:VelocityCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_e_kin a owl:ObjectProperty ;
    rdfs:label "del_e_kin" ;
    rdfs:range thermo:SpecificKineticEnergyCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_e_pot a owl:ObjectProperty ;
    rdfs:label "del_e_pot" ;
    rdfs:range thermo:SpecificPotentialEnergyCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_h a owl:ObjectProperty ;
    rdfs:label "del_h" ;
    rdfs:range thermo:SpecificEnthalpyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_p a owl:ObjectProperty ;
    rdfs:label "del_p" ;
    rdfs:range thermo:PressureDifference ;
    skos:inScheme thermo:concepts .

thermo:del_u a owl:ObjectProperty ;
    rdfs:label "del_u" ;
    rdfs:range thermo:SpecificInternalEnergyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_v a owl:ObjectProperty ;
    rdfs:label "del_v" ;
    rdfs:range thermo:SpecificVolumeDifference ;
    skos:inScheme thermo:concepts .

thermo:del_z a owl:ObjectProperty ;
    rdfs:label "del_z" ;
    rdfs:range thermo:PositionCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:e_kin a owl:ObjectProperty ;
    rdfs:label "e_kin" ;
    rdfs:range thermo:SpecificKineticEnergyCenterMass ;
    skos:inScheme thermo:concepts .

thermo:e_pot a owl:ObjectProperty ;
    rdfs:label "e_pot" ;
    rdfs:range thermo:SpecificPotentialEnergyCenterMass ;
    skos:inScheme thermo:concepts .

thermo:equation_of_state a owl:ObjectProperty ;
    rdfs:label "equation_of_state" ;
    rdfs:range thermo:EquationOfState ;
    skos:inScheme thermo:concepts .

thermo:final_state a owl:ObjectProperty ;
    rdfs:label "final_state" ;
    rdfs:range thermo:State ;
    skos:inScheme thermo:concepts .

thermo:id a owl:DatatypeProperty ;
    rdfs:label "id" ;
    skos:inScheme thermo:concepts .

thermo:initial_state a owl:ObjectProperty ;
    rdfs:label "initial_state" ;
    rdfs:range thermo:State ;
    skos:inScheme thermo:concepts .

thermo:kappa a owl:ObjectProperty ;
    rdfs:label "kappa" ;
    rdfs:range thermo:HeatCapacityRatio ;
    skos:inScheme thermo:concepts .

thermo:material a owl:ObjectProperty ;
    rdfs:label "material" ;
    rdfs:range thermo:PureMaterial ;
    skos:inScheme thermo:concepts .

thermo:model a owl:ObjectProperty ;
    rdfs:label "model" ;
    rdfs:range thermo:EquationOfStateModels ;
    skos:inScheme thermo:concepts .

thermo:polytropic_index a owl:ObjectProperty ;
    rdfs:label "polytropic_index" ;
    rdfs:range thermo:PolytropicIndex ;
    skos:inScheme thermo:concepts .

thermo:q a owl:ObjectProperty ;
    rdfs:label "q" ;
    rdfs:range thermo:HeatPerMass ;
    skos:inScheme thermo:concepts .

thermo:reversible a owl:DatatypeProperty ;
    rdfs:label "reversible" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:rho a owl:ObjectProperty ;
    rdfs:label "rho" ;
    rdfs:range thermo:SpecificDensity ;
    skos:inScheme thermo:concepts .

thermo:s a owl:ObjectProperty ;
    rdfs:label "s" ;
    rdfs:range thermo:SpecificEntropy ;
    skos:inScheme thermo:concepts .

thermo:w a owl:ObjectProperty ;
    rdfs:label "w" ;
    rdfs:range thermo:WorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_a a owl:ObjectProperty ;
    rdfs:label "w_a" ;
    rdfs:range thermo:ExternalWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_electrical a owl:ObjectProperty ;
    rdfs:label "w_electrical" ;
    rdfs:range thermo:ElectricalWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_i a owl:ObjectProperty ;
    rdfs:label "w_i" ;
    rdfs:range thermo:InternalWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_stir a owl:ObjectProperty ;
    rdfs:label "w_stir" ;
    rdfs:range thermo:StirringWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_t a owl:ObjectProperty ;
    rdfs:label "w_t" ;
    rdfs:range thermo:TechnicalWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:w_vol a owl:ObjectProperty ;
    rdfs:label "w_vol" ;
    rdfs:range thermo:VolumeWorkPerMass ;
    skos:inScheme thermo:concepts .

thermo:z a owl:ObjectProperty ;
    rdfs:label "z" ;
    rdfs:range thermo:PositionCenterMass ;
    skos:inScheme thermo:concepts .

thermo:AmountOfSubstance a owl:Class ;
    rdfs:label "AmountOfSubstance" ;
    schema1:Unit "mol" ;
    schema1:mathExpression "n" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:Variable ;
    skos:altLabel "amount of substance" ;
    skos:inScheme thermo:variables .

thermo:EquationOfStateModels a owl:Class ;
    owl:unionOf ( <https://example.org/thermodynamics/EquationOfStateModels#ideal+gas> <https://example.org/thermodynamics/EquationOfStateModels#van+der+Waals> ) ;
    linkml:permissible_values <https://example.org/thermodynamics/EquationOfStateModels#ideal+gas>,
        <https://example.org/thermodynamics/EquationOfStateModels#van+der+Waals> .

thermo:IndividualGasConstant a owl:Class ;
    rdfs:label "IndividualGasConstant" ;
    schema1:Unit "J/(kg K)" ;
    schema1:mathExpression "R" ;
    rdfs:subClassOf thermo:MaterialProperty,
        thermo:Variable ;
    skos:altLabel "individual gas constant",
        "specific gas constant" ;
    skos:inScheme thermo:variables .

thermo:Mass a owl:Class ;
    rdfs:label "Mass" ;
    schema1:Unit "kg" ;
    schema1:mathExpression "m" ;
    rdfs:subClassOf thermo:Variable ;
    skos:altLabel "mass" ;
    skos:inScheme thermo:variables .

thermo:MolarMass a owl:Class ;
    rdfs:label "MolarMass" ;
    schema1:Unit "kg/mol" ;
    schema1:mathExpression "M" ;
    rdfs:subClassOf thermo:MaterialProperty,
        thermo:Variable ;
    skos:altLabel "molar mass" ;
    skos:inScheme thermo:variables .

thermo:SpecificVolume a owl:Class ;
    rdfs:label "SpecificVolume" ;
    schema1:Unit "m^3/kg" ;
    schema1:mathExpression "v" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:SpecificProperty,
        thermo:Variable ;
    skos:altLabel "specific volume" ;
    skos:inScheme thermo:variables .

thermo:Volume a owl:Class ;
    rdfs:label "Volume" ;
    schema1:Unit "m^3" ;
    schema1:mathExpression "V" ;
    rdfs:subClassOf thermo:ExtensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "volume" ;
    skos:inScheme thermo:variables .

thermo:ChangeOfState a owl:Class ;
    rdfs:label "ChangeOfState" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_electrical ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ElectricalWork ;
            owl:onProperty thermo:W_electrical ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_a ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_stir ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_a ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalEnergyDifference ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_stir ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificPotentialEnergyCenterMassDifference ;
            owl:onProperty thermo:del_e_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_vol ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VelocityCenterMassDifference ;
            owl:onProperty thermo:del_c ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_c ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:initial_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:EntropyDifference ;
            owl:onProperty thermo:del_S ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_h ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Work ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:final_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEntropyDifference ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalWorkPerMass ;
            owl:onProperty thermo:w_i ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_U ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:TechnicalWorkPerMass ;
            owl:onProperty thermo:w_t ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:final_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_H ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_u ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VolumeDifference ;
            owl:onProperty thermo:del_V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VolumeWork ;
            owl:onProperty thermo:W_vol ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ExternalWorkPerMass ;
            owl:onProperty thermo:w_a ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:StirringWork ;
            owl:onProperty thermo:W_stir ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificInternalEnergyDifference ;
            owl:onProperty thermo:del_u ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PositionCenterMassDifference ;
            owl:onProperty thermo:del_z ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:KineticEnergyCenterMassDifference ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Heat ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_electrical ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_stir ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_vol ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:q ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:final_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_e_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_vol ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_S ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_V ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEnthalpyDifference ;
            owl:onProperty thermo:del_h ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_a ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PolytropicIndex ;
            owl:onProperty thermo:polytropic_index ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_i ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_s ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VolumeWorkPerMass ;
            owl:onProperty thermo:w_vol ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:reversible ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_c ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_H ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_vol ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_i ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:StirringWorkPerMass ;
            owl:onProperty thermo:w_stir ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_E_kin ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificVolumeDifference ;
            owl:onProperty thermo:del_v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_T ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:adiabatic ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ElectricalWorkPerMass ;
            owl:onProperty thermo:w_electrical ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_t ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:EnthalpyDifference ;
            owl:onProperty thermo:del_H ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_electrical ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:reversible ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PotentialEnergyCenterMassDifference ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:reversible ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_v ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_e_kin ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ExternalWork ;
            owl:onProperty thermo:W_a ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_z ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_u ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:adiabatic ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_i ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:polytropic_index ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:q ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_S ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:initial_state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:polytropic_index ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PressureDifference ;
            owl:onProperty thermo:del_p ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:W_stir ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_a ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificKineticEnergyCenterMassDifference ;
            owl:onProperty thermo:del_e_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:adiabatic ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:Q ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_e_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_h ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:w_electrical ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_E_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:del_z ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:W_i ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:del_e_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:HeatPerMass ;
            owl:onProperty thermo:q ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:WorkPerMass ;
            owl:onProperty thermo:w ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:TemperatureDifference ;
            owl:onProperty thermo:del_T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:initial_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:w_t ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalWork ;
            owl:onProperty thermo:W_i ],
        thermo:Concept ;
    skos:altLabel "change of state" ;
    skos:inScheme thermo:concepts .

thermo:Concept a owl:Class ;
    rdfs:label "Concept" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:minCardinality 1 ;
            owl:onProperty thermo:id ],
        thermo:Element ;
    skos:inScheme thermo:concepts .

thermo:Equation a owl:Class ;
    rdfs:label "Equation" ;
    rdfs:subClassOf thermo:MathematicalFormula ;
    skos:inScheme thermo:equations .

thermo:ExtensiveStateVariable a owl:Class ;
    rdfs:label "ExtensiveStateVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "extensive property" ;
    skos:inScheme thermo:variables .

thermo:System a owl:Class ;
    rdfs:label "System" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:changes_of_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Mass ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:material ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:closed ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PureMaterial ;
            owl:onProperty thermo:material ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:MolarMass ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:m ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:AmountOfSubstance ;
            owl:onProperty thermo:n ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:material ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:states ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:homogeneous ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:closed ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:states ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:M ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:closed ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:motion ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ChangeOfState ;
            owl:onProperty thermo:changes_of_state ],
        thermo:Concept ;
    skos:altLabel "system" ;
    skos:inScheme thermo:concepts .

thermo:Temperature a owl:Class ;
    rdfs:label "Temperature" ;
    schema1:Unit "K" ;
    schema1:mathExpression "T" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "temperature" ;
    skos:inScheme thermo:variables .

thermo:ExternalStateVariable a owl:Class ;
    rdfs:label "ExternalStateVariable" ;
    rdfs:subClassOf thermo:StateVariable ;
    skos:altLabel "external state variable" ;
    skos:definition "External state variables are state variables that depend on the internal state variables of the systems  and its interactions with the surroundings." ;
    skos:inScheme thermo:variables .

thermo:MaterialProperty a owl:Class ;
    rdfs:label "MaterialProperty" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "material property" ;
    skos:definition "Properties that describe a material." ;
    skos:inScheme thermo:variables .

thermo:Pressure a owl:Class ;
    rdfs:label "Pressure" ;
    schema1:Unit "Pa" ;
    schema1:mathExpression "p" ;
    rdfs:subClassOf thermo:IntensiveStateVariable,
        thermo:InternalStateVariable,
        thermo:Variable ;
    skos:altLabel "pressure" ;
    skos:inScheme thermo:variables .

thermo:Q a owl:ObjectProperty ;
    rdfs:label "Q" ;
    rdfs:range thermo:Heat ;
    skos:inScheme thermo:concepts .

thermo:Rbar a owl:ObjectProperty ;
    rdfs:label "Rbar" ;
    rdfs:range thermo:UniversalGasConstant ;
    skos:inScheme thermo:concepts .

thermo:SpecificProperty a owl:Class ;
    rdfs:label "SpecificProperty" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "specific property" ;
    skos:definition "Specific properties are extensive properties per unit mass.  We denote them by lower case letters." ;
    skos:inScheme thermo:variables .

thermo:W a owl:ObjectProperty ;
    rdfs:label "W" ;
    rdfs:range thermo:Work ;
    skos:inScheme thermo:concepts .

thermo:change_of_state a owl:ObjectProperty ;
    rdfs:label "change_of_state" ;
    rdfs:range thermo:ChangeOfState ;
    skos:inScheme thermo:concepts .

thermo:del_E_kin a owl:ObjectProperty ;
    rdfs:label "del_E_kin" ;
    rdfs:range thermo:KineticEnergyCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_E_pot a owl:ObjectProperty ;
    rdfs:label "del_E_pot" ;
    rdfs:range thermo:PotentialEnergyCenterMassDifference ;
    skos:inScheme thermo:concepts .

thermo:del_U a owl:ObjectProperty ;
    rdfs:label "del_U" ;
    rdfs:range thermo:InternalEnergyDifference ;
    skos:inScheme thermo:concepts .

thermo:del_s a owl:ObjectProperty ;
    rdfs:label "del_s" ;
    rdfs:range thermo:SpecificEntropyDifference ;
    skos:inScheme thermo:concepts .

thermo:h a owl:ObjectProperty ;
    rdfs:label "h" ;
    rdfs:range thermo:SpecificEnthalpy ;
    skos:inScheme thermo:concepts .

thermo:homogeneous a owl:DatatypeProperty ;
    rdfs:label "homogeneous" ;
    rdfs:range xsd:boolean ;
    skos:definition "A system is homogenous if at all locations inside the system all intesive  state variables have the same value." ;
    skos:inScheme thermo:concepts .

thermo:motion a owl:DatatypeProperty ;
    rdfs:label "motion" ;
    rdfs:range xsd:boolean ;
    skos:inScheme thermo:concepts .

thermo:state a owl:ObjectProperty ;
    rdfs:label "state" ;
    rdfs:range thermo:State ;
    skos:inScheme thermo:concepts .

thermo:system a owl:ObjectProperty ;
    rdfs:label "system" ;
    rdfs:range thermo:System ;
    skos:inScheme thermo:concepts .

thermo:u a owl:ObjectProperty ;
    rdfs:label "u" ;
    rdfs:range thermo:SpecificInternalEnergy ;
    skos:inScheme thermo:concepts .

thermo:StateVariable a owl:Class ;
    rdfs:label "StateVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "state variable" ;
    skos:definition "Measurable variables that characterize the state of a system." ;
    skos:inScheme thermo:variables .

thermo:VariableConcept a owl:Class ;
    rdfs:label "VariableConcept" ;
    skos:inScheme thermo:variables .

thermo:M a owl:ObjectProperty ;
    rdfs:label "M" ;
    rdfs:range thermo:MolarMass ;
    skos:inScheme thermo:concepts .

thermo:R a owl:ObjectProperty ;
    rdfs:label "R" ;
    rdfs:range thermo:IndividualGasConstant ;
    skos:inScheme thermo:concepts .

thermo:State a owl:Class ;
    rdfs:label "State" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:S ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificDensity ;
            owl:onProperty thermo:rho ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:rho ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:VelocityCenterMass ;
            owl:onProperty thermo:c ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:StandardTemperature ;
            owl:onProperty thermo:T0 ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificVolume ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:c ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:e_pot ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T0 ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:S ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:z ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEnthalpy ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:c ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:E_kin ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Entropy ;
            owl:onProperty thermo:S ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:E_pot ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Pressure ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:U ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:z ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificInternalEnergy ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Temperature ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:rho ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Volume ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:s ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificEntropy ;
            owl:onProperty thermo:s ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:E_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:H ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T0 ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:E_kin ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:u ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:s ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:H ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:V ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:p ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:v ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:e_pot ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificKineticEnergyCenterMass ;
            owl:onProperty thermo:e_kin ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:e_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:T ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:Enthalpy ;
            owl:onProperty thermo:H ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PositionCenterMass ;
            owl:onProperty thermo:z ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:InternalEnergy ;
            owl:onProperty thermo:U ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:h ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:PotentialEnergyCenterMass ;
            owl:onProperty thermo:E_pot ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:SpecificPotentialEnergyCenterMass ;
            owl:onProperty thermo:e_pot ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:e_kin ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:U ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:boolean ;
            owl:onProperty thermo:equilibrium ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:KineticEnergyCenterMass ;
            owl:onProperty thermo:E_kin ],
        thermo:Concept ;
    skos:altLabel "state" ;
    skos:definition "The thermodynamic state of a system is characterized by macroscopic,  measurable properties sufficient to determine all other  macroscopic properties." ;
    skos:inScheme thermo:concepts .

thermo:V a owl:ObjectProperty ;
    rdfs:label "V" ;
    rdfs:range thermo:Volume ;
    skos:inScheme thermo:concepts .

thermo:equilibrium a owl:DatatypeProperty ;
    rdfs:label "equilibrium" ;
    rdfs:range xsd:boolean ;
    skos:definition "A system is in equilibrium if no changes occur if it is isolated from  its surroundings" ;
    skos:inScheme thermo:concepts .

thermo:m a owl:ObjectProperty ;
    rdfs:label "m" ;
    rdfs:range thermo:Mass ;
    skos:inScheme thermo:concepts .

thermo:n a owl:ObjectProperty ;
    rdfs:label "n" ;
    rdfs:range thermo:AmountOfSubstance ;
    skos:inScheme thermo:concepts .

thermo:v a owl:ObjectProperty ;
    rdfs:label "v" ;
    rdfs:range thermo:SpecificVolume ;
    skos:inScheme thermo:concepts .

thermo:SystemInStateEquation a owl:Class ;
    rdfs:label "SystemInStateEquation" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:System ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:state ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:state ],
        thermo:ClosedSystemRule,
        thermo:Equation,
        thermo:HomogeneousSystemRule,
        thermo:SystemInEquilibriumRule ;
    skos:inScheme thermo:equations .

thermo:IntensiveStateVariable a owl:Class ;
    rdfs:label "IntensiveStateVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "intensive property" ;
    skos:definition "The value of an intensive property of a homogenous system does  not vary with the mass of the system. " ;
    skos:inScheme thermo:variables .

thermo:Rule a owl:Class ;
    rdfs:label "Rule" ;
    skos:inScheme thermo:rules .

thermo:T a owl:ObjectProperty ;
    rdfs:label "T" ;
    rdfs:range thermo:Temperature ;
    skos:inScheme thermo:concepts .

thermo:p a owl:ObjectProperty ;
    rdfs:label "p" ;
    rdfs:range thermo:Pressure ;
    skos:inScheme thermo:concepts .

thermo:ChangeOfStateDifferenceEquation a owl:Class ;
    rdfs:label "ChangeOfStateDifferenceEquation" ;
    rdfs:subClassOf thermo:ChangeOfStateEquation ;
    skos:inScheme thermo:equations .

thermo:Difference a owl:Class ;
    rdfs:label "Difference" ;
    rdfs:subClassOf thermo:DerivedVariable ;
    skos:altLabel "difference" ;
    skos:inScheme thermo:derivedVariables .

thermo:InternalStateVariable a owl:Class ;
    rdfs:label "InternalStateVariable" ;
    rdfs:subClassOf thermo:StateVariable ;
    skos:altLabel "internal state variable" ;
    skos:definition "Describes the state of a system that does not move." ;
    skos:inScheme thermo:variables .

thermo:DefiningEquation a owl:Class ;
    rdfs:label "DefiningEquation" ;
    skos:inScheme thermo:definingEquations .

thermo:ChangeOfStateVariable a owl:Class ;
    rdfs:label "ChangeOfStateVariable" ;
    rdfs:subClassOf thermo:VariableConcept ;
    skos:altLabel "change of state variable" ;
    skos:definition "Measurable variables that characterize the change of state of a system." ;
    skos:inScheme thermo:variables .

thermo:Variable a owl:Class ;
    rdfs:label "Variable" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom xsd:float ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:id ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:value ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:id ],
        thermo:Element ;
    skos:altLabel "quantity",
        "variable" ;
    skos:inScheme thermo:variables .

thermo:pureMaterials a owl:ObjectProperty ;
    rdfs:label "pureMaterials" ;
    rdfs:range thermo:PureMaterial ;
    skos:inScheme thermo:problem . 

thermo:Problem a owl:Class ;
    rdfs:label "Problem" ;
    rdfs:subClassOf [ a owl:Restriction ;
            owl:allValuesFrom thermo:PureMaterial ;
            owl:onProperty thermo:pureMaterials ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:changes_of_state ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:System ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:ChangeOfState ;
            owl:onProperty thermo:changes_of_state ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:states ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:pureMaterials ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:name ],
        [ a owl:Restriction ;
            owl:allValuesFrom xsd:string ;
            owl:onProperty thermo:name ],
        [ a owl:Restriction ;
            owl:minCardinality 0 ;
            owl:onProperty thermo:system ],
        [ a owl:Restriction ;
            owl:maxCardinality 1 ;
            owl:onProperty thermo:name ],
        [ a owl:Restriction ;
            owl:allValuesFrom thermo:State ;
            owl:onProperty thermo:states ] ;
    skos:inScheme thermo:problem .


`