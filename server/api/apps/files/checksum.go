package files

import (
	"net/http"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/server/api"
	"github.com/get3w/get3w/storage"

	"github.com/labstack/echo"
)

// Checksum get path and checksum map of all files, dedicated to cli
func Checksum(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	app, err := api.GetApp(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewLocalParser(api.Owner(c), appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	files, err := parser.Storage.GetAllFiles(parser.Storage.GetSourcePrefix(""))
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	output := &get3w.FilesChecksumOutput{
		Files: make(map[string]string),
	}

	for _, file := range files {
		output.Files[file.Path] = file.Checksum
	}

	return c.JSON(http.StatusOK, output)
}
