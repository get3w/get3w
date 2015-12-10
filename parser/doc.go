package parser

import (
	"fmt"
	"strings"

	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/packages/liquid"
)

// ParseDoc parse doc
func ParseDoc(rootPath, template string, config *get3w.Config, doc map[string]string) string {
	if template == "" {
		template = doc["content"]
	}

	fmt.Println(structs.Map(config))

	data := map[string]interface{}{
		"site": structs.Map(config),
		"page": doc,
		"doc":  doc,
	}

	var parsedContent string
	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(rootPath)
		data["content"] = parser.Parse(doc["content"], data)
		parsedContent = parser.Parse(template, data)
	} else {
		parsedContent = template
	}

	return parsedContent
}
