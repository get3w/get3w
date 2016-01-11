package files

import (
	"encoding/base64"
	"net/http"
	"time"

	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/ioutils"
	"github.com/get3w/get3w/pkg/timeutils"
	"github.com/get3w/get3w/storage"
	"github.com/get3w/get3w/www-server/api"

	"github.com/labstack/echo"
)

// Push file content
func Push(c *echo.Context) error {
	appPath := c.Param("app_path")
	if appPath == "" {
		return api.ErrorNotFound(c, nil)
	}

	if api.IsAnonymous(c) {
		return api.ErrorUnauthorized(c, nil)
	}

	input := &get3w.FilesPushInput{}
	err := api.LoadRequestInput(c, input)
	if err != nil {
		return api.ErrorBadRequest(c, err)
	}

	app, err := api.GetApp(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	if app == nil {
		return api.ErrorNotFound(c, nil)
	}

	parser, err := storage.NewLocalParser(appPath)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	data, err := base64.StdEncoding.DecodeString(input.Blob)
	if err != nil {
		return api.ErrorInternal(c, err)
	}
	pathBytesMap, err := ioutils.UnPack(data)
	if err != nil {
		return api.ErrorInternal(c, err)
	}

	for _, addedPath := range input.Added {
		parser.Storage.Write(parser.Storage.GetSourceKey(addedPath), pathBytesMap[addedPath])
	}
	for _, modifiedPath := range input.Modified {
		parser.Storage.Write(parser.Storage.GetSourceKey(modifiedPath), pathBytesMap[modifiedPath])
	}
	for _, removedPath := range input.Removed {
		parser.Storage.Delete(parser.Storage.GetSourceKey(removedPath))
	}

	output := &get3w.FileEditOutput{
		LastModified: timeutils.ToString(time.Now()),
	}
	return c.JSON(http.StatusOK, output)
}
