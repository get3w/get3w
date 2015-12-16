package storage

import (
	log "github.com/Sirupsen/logrus"
	"github.com/fatih/structs"
	"github.com/get3w/get3w-sdk-go/get3w"
	"gopkg.in/yaml.v2"
)

// WriteConfig write content to config file
func (parser *Parser) WriteConfig() error {
	config := structs.Map(parser.Config)
	for _, site := range parser.Sites {
		if site.Path == "." {
			for key, val := range site.AllParameters {
				if _, ok := config[key]; !ok {
					config[key] = val
				}
			}
		}
	}
	bs, err := yaml.Marshal(config)
	if err != nil {
		return err
	}
	return parser.Storage.Write(parser.Storage.GetSourceKey(KeyConfig), bs)
}

func loadConfig(s Storage) *get3w.Config {
	config := &get3w.Config{}
	path := s.GetRootKey(KeyConfig)
	if s.IsExist(path) {
		data, _ := s.Read(path)
		yaml.Unmarshal(data, config)
	}

	if config.TemplateEngine == "" {
		config.TemplateEngine = TemplateEngineLiquid
	}
	if config.LayoutChannel == "" {
		config.LayoutChannel = "default"
	}
	if config.LayoutPost == "" {
		config.LayoutPost = "post"
	}
	if config.Destination == "" {
		config.Destination = "_public"
	}

	return config
}

func (parser *Parser) loadSiteParameters(loadDefault bool) {
	allParameters := make(map[string]interface{})
	path := parser.key(KeyConfig)
	if parser.Storage.IsExist(path) {
		configData, _ := parser.Storage.Read(path)
		yaml.Unmarshal(configData, allParameters)
	} else {
		if loadDefault {
			for key, val := range parser.Default.AllParameters {
				if _, ok := allParameters[key]; !ok {
					allParameters[key] = val
				}
			}
		}
	}

	parser.Current.AllParameters = allParameters
}

// LogWarn write content to log file
func (parser *Parser) LogWarn(templateURL, pageURL, warning string) {
	if parser.logger != nil {
		parser.logger.WithFields(log.Fields{
			"templateURL": templateURL,
			"pageURL":     pageURL,
		}).Warn(warning)
	}
}

// LogError write content to log file
func (parser *Parser) LogError(templateURL, pageURL string, err error) {
	if parser.logger != nil {
		parser.logger.WithFields(log.Fields{
			"templateURL": templateURL,
			"pageURL":     pageURL,
		}).Error(err.Error())
	}
}
