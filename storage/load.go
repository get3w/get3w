package storage

import "github.com/get3w/get3w-sdk-go/get3w"

func loadConfigAndSites(s Storage) (config *get3w.Config, sites []*get3w.Site, defaultSite *get3w.Site) {
	config = loadConfig(s)
	sites, defaultSite = loadSites(s)
	return
}

func (parser *Parser) loadSiteResources(loadDefault bool) {
	parser.loadSiteParameters(loadDefault)
	parser.loadSitePosts()
	parser.loadSiteLinks(loadDefault)
	parser.loadSiteChannels()
	parser.loadSiteSections(loadDefault)
}
